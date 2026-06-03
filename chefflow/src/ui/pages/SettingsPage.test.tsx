import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from './SettingsPage';
import { useTierStore } from '../../state/useTierStore';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { useProfileStore } from '../../state/useProfileStore';

vi.mock('../../core/util/image', () => ({
  downscaleToDataUrl: vi.fn(async () => 'data:image/jpeg;base64,fake'),
}));

// Stub getQuotaSnapshot + createPortalUrl so the page doesn't try to
// reach the worker.
vi.mock('../../core/tier/quotaClient', async () => {
  const actual = await vi.importActual<typeof import('../../core/tier/quotaClient')>('../../core/tier/quotaClient');
  return {
    ...actual,
    getQuotaSnapshot: vi.fn(async () => ({
      tier: 'free' as const,
      quotas: {
        recipe: { count: 2, remaining: 3, limit: 5 },
        event: { count: 0, remaining: 1, limit: 1 },
        llm: { count: 4, remaining: 6, limit: 10 },
      },
    })),
    createPortalUrl: vi.fn(async () => 'https://billing.stripe.com/p/fake'),
  };
});

beforeEach(() => {
  useTierStore.setState({ tier: 'free' });
  useUpgradeSheetStore.setState({ open: false, reason: null });
  useProfileStore.setState({ displayName: '', avatarDataUrl: null });
  // Text-size preference persists via localStorage + sets a style on
  // <html>. Reset both so each test starts from the medium default.
  localStorage.removeItem('chefflow-text-size');
  document.documentElement.style.fontSize = '';
  cleanup();
});

function renderPage(initialEntries: string[] = ['/settings']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SettingsPage />
    </MemoryRouter>
  );
}

describe('SettingsPage', () => {
  it('shows the Free tier chip and Upgrade CTA for free users', async () => {
    useTierStore.setState({ tier: 'free' });
    renderPage(['/settings?tab=plan']);
    expect(screen.getByTestId('settings-tier-chip')).toHaveTextContent(/free/i);
    expect(screen.getByTestId('settings-upgrade-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-portal-cta')).toBeNull();
  });

  it('Upgrade CTA opens the UpgradeSheet via the store', async () => {
    const user = userEvent.setup();
    useTierStore.setState({ tier: 'free' });
    renderPage(['/settings?tab=plan']);
    await user.click(screen.getByTestId('settings-upgrade-cta'));
    expect(useUpgradeSheetStore.getState().open).toBe(true);
  });

  it('shows the Pro tier chip and Manage Billing CTA for pro users', () => {
    useTierStore.setState({ tier: 'pro' });
    renderPage(['/settings?tab=plan']);
    expect(screen.getByTestId('settings-tier-chip')).toHaveTextContent(/pro/i);
    expect(screen.getByTestId('settings-portal-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-upgrade-cta')).toBeNull();
  });

  it("renders today's usage from the snapshot", async () => {
    useTierStore.setState({ tier: 'free' });
    renderPage(['/settings?tab=plan']);
    await waitFor(() => {
      expect(screen.getByText('2 / 5')).toBeInTheDocument(); // recipes
      expect(screen.getByText('0 / 1')).toBeInTheDocument(); // events
      expect(screen.getByText('4 / 10')).toBeInTheDocument(); // llm
    });
  });

  it('shows the post-upgrade banner when ?upgraded=1 is present', () => {
    useTierStore.setState({ tier: 'pro' });
    renderPage(['/settings?upgraded=1']);
    expect(screen.getByRole('status')).toHaveTextContent(/welcome to pro/i);
  });

  it('calls Clerk user.reload() on mount when ?upgraded=1 — primes the tier refresh', () => {
    const reload = vi.fn(() => Promise.resolve());
    (window as unknown as { Clerk: { user: { reload: () => Promise<void> } } }).Clerk = {
      user: { reload },
    };
    useTierStore.setState({ tier: 'free' }); // race: webhook hasn't fired yet
    try {
      renderPage(['/settings?upgraded=1']);
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      delete (window as unknown as { Clerk?: unknown }).Clerk;
    }
  });

  it('retries Clerk user.reload() on an exponential schedule covering ~p99 webhook latency', async () => {
    // Schedule: t=0, t=1500ms, t=3500ms, t=7500ms. Each retry no-ops if
    // tier has already flipped — here tier stays free so all 4 fire.
    vi.useFakeTimers();
    const reload = vi.fn(() => Promise.resolve());
    (window as unknown as { Clerk: { user: { reload: () => Promise<void> } } }).Clerk = {
      user: { reload },
    };
    useTierStore.setState({ tier: 'free' });
    try {
      renderPage(['/settings?upgraded=1']);
      expect(reload).toHaveBeenCalledTimes(1);             // initial
      await vi.advanceTimersByTimeAsync(1600);
      expect(reload).toHaveBeenCalledTimes(2);             // +1500ms
      await vi.advanceTimersByTimeAsync(2000);
      expect(reload).toHaveBeenCalledTimes(3);             // +3500ms cumulative
      await vi.advanceTimersByTimeAsync(4000);
      expect(reload).toHaveBeenCalledTimes(4);             // +7500ms cumulative
    } finally {
      vi.useRealTimers();
      delete (window as unknown as { Clerk?: unknown }).Clerk;
    }
  });

  it('skips remaining retries once the tier flips to pro mid-schedule', async () => {
    vi.useFakeTimers();
    const reload = vi.fn(() => Promise.resolve());
    (window as unknown as { Clerk: { user: { reload: () => Promise<void> } } }).Clerk = {
      user: { reload },
    };
    useTierStore.setState({ tier: 'free' });
    try {
      renderPage(['/settings?upgraded=1']);
      expect(reload).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1600);
      expect(reload).toHaveBeenCalledTimes(2);
      // Simulate webhook arriving — tier flips to pro.
      useTierStore.setState({ tier: 'pro' });
      await vi.advanceTimersByTimeAsync(6000);
      // No more reloads — the remaining timers check tier and short-circuit.
      expect(reload).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      delete (window as unknown as { Clerk?: unknown }).Clerk;
    }
  });

  it('shows a "Still on Free? Refresh status" button when tier hasn\'t flipped', () => {
    useTierStore.setState({ tier: 'free' });
    renderPage(['/settings?upgraded=1']);
    expect(screen.getByTestId('settings-manual-refresh')).toBeInTheDocument();
  });

  it('hides the manual refresh button once tier is pro', () => {
    useTierStore.setState({ tier: 'pro' });
    renderPage(['/settings?upgraded=1']);
    expect(screen.queryByTestId('settings-manual-refresh')).toBeNull();
  });

  it('renders the Profile section with a name input', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByTestId('settings-profile-name-input')).toBeInTheDocument();
  });

  it('typing in the name input + blur updates useProfileStore', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByTestId('settings-profile-name-input');
    await user.type(input, 'Derek');
    await user.tab();
    expect(useProfileStore.getState().displayName).toBe('Derek');
  });

  it('renders the Theme section as a segmented Light/Dark radiogroup so chefs see both options at once', () => {
    renderPage(['/settings?tab=preferences']);
    expect(screen.getByRole('heading', { name: /^theme$/i })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByTestId('settings-theme-light')).toBeInTheDocument();
    expect(screen.getByTestId('settings-theme-dark')).toBeInTheDocument();
  });

  // Text-size preference. Why we test the side-effect (html font-size +
  // localStorage) rather than just the button state: the whole purpose
  // of the feature is to scale the entire app via the root rem unit, so
  // a regression where the buttons render but don't apply the change is
  // the exact failure we want to catch.
  it('renders the Text size section as a Small/Medium/Large radiogroup', () => {
    renderPage(['/settings?tab=preferences']);
    expect(screen.getByRole('heading', { name: /^text size$/i })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /text size/i })).toBeInTheDocument();
    expect(screen.getByTestId('settings-textsize-small')).toBeInTheDocument();
    expect(screen.getByTestId('settings-textsize-medium')).toBeInTheDocument();
    expect(screen.getByTestId('settings-textsize-large')).toBeInTheDocument();
  });

  it('clicking Large sets the root font-size to 18px and persists "large" to localStorage', async () => {
    const user = userEvent.setup();
    renderPage(['/settings?tab=preferences']);
    await user.click(screen.getByTestId('settings-textsize-large'));
    await waitFor(() => {
      expect(document.documentElement.style.fontSize).toBe('18px');
      expect(localStorage.getItem('chefflow-text-size')).toBe('large');
    });
  });

  it('initial render reflects a stored "small" preference (applied on cold load)', () => {
    localStorage.setItem('chefflow-text-size', 'small');
    renderPage(['/settings?tab=preferences']);
    expect(screen.getByTestId('settings-textsize-small')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('settings-textsize-medium')).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.style.fontSize).toBe('14px');
  });

  it('tab nav renders 5 tabs and selects Profile by default', () => {
    renderPage();
    expect(screen.getByTestId('settings-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-profile')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('settings-tab-plan')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a tab swaps the visible section', async () => {
    const user = userEvent.setup();
    renderPage();
    // Profile tab default → Theme heading NOT visible (it's in Preferences).
    expect(screen.queryByRole('heading', { name: /^theme$/i })).toBeNull();
    // Click Preferences → Theme heading appears.
    await user.click(screen.getByTestId('settings-tab-preferences'));
    expect(screen.getByRole('heading', { name: /^theme$/i })).toBeInTheDocument();
  });
});
