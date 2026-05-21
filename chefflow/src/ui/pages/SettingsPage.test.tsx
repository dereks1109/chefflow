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
    renderPage();
    expect(screen.getByTestId('settings-tier-chip')).toHaveTextContent(/free/i);
    expect(screen.getByTestId('settings-upgrade-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-portal-cta')).toBeNull();
  });

  it('Upgrade CTA opens the UpgradeSheet via the store', async () => {
    const user = userEvent.setup();
    useTierStore.setState({ tier: 'free' });
    renderPage();
    await user.click(screen.getByTestId('settings-upgrade-cta'));
    expect(useUpgradeSheetStore.getState().open).toBe(true);
  });

  it('shows the Pro tier chip and Manage Billing CTA for pro users', () => {
    useTierStore.setState({ tier: 'pro' });
    renderPage();
    expect(screen.getByTestId('settings-tier-chip')).toHaveTextContent(/pro/i);
    expect(screen.getByTestId('settings-portal-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-upgrade-cta')).toBeNull();
  });

  it("renders today's usage from the snapshot", async () => {
    useTierStore.setState({ tier: 'free' });
    renderPage();
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

  it('renders the Theme section with a ThemeToggle and current mode label', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /^theme$/i })).toBeInTheDocument();
    expect(screen.getByText(/^(light|dark)$/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /switch to (light|dark) mode/i }),
    ).toBeInTheDocument();
  });
});
