import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UsageMeter from './UsageMeter';
import { useTierStore } from '../../state/useTierStore';

vi.mock('../../core/tier/quotaClient', async () => {
  const actual = await vi.importActual<typeof import('../../core/tier/quotaClient')>('../../core/tier/quotaClient');
  return {
    ...actual,
    getQuotaSnapshot: vi.fn(async () => ({
      tier: 'free' as const,
      quotas: {
        recipe: { count: 4, remaining: 1, limit: 5 },
        event: { count: 0, remaining: 1, limit: 1 },
        llm: { count: 7, remaining: 3, limit: 10 },
      },
    })),
  };
});

beforeEach(() => {
  useTierStore.setState({ tier: 'free' });
});

afterEach(() => cleanup());

function renderMeter(initial: string[] = ['/recipes']) {
  return render(
    <MemoryRouter initialEntries={initial}>
      <UsageMeter />
    </MemoryRouter>
  );
}

describe('UsageMeter', () => {
  it('renders the recipe count on /recipes', async () => {
    renderMeter(['/recipes']);
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('recipes 4/5'));
  });

  it('renders the events count on /events', async () => {
    renderMeter(['/events']);
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('events 0/1'));
  });

  it('falls back to AI count off the library routes', async () => {
    renderMeter(['/workflows']);
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('AI 7/10'));
  });

  it('renders nothing for pro users (no caps)', () => {
    useTierStore.setState({ tier: 'pro' });
    const { container } = renderMeter(['/recipes']);
    expect(container.firstChild).toBeNull();
  });
});
