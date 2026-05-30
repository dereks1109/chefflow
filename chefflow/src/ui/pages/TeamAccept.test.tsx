import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TeamAccept from './TeamAccept';
import * as teamsClient from '../../core/teams/teamsClient';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderAccept(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/teams/accept" element={<TeamAccept />} />
        <Route path="/recipes" element={<div>Recipes library</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TeamAccept page (T3c Phase 5)', () => {
  // Why these matter: TeamAccept is the chef's first touchpoint with the
  // teams feature — landing here from an invite email. Wrong copy / silent
  // failure = onboarding regression. Tests pin the three branch outcomes
  // (success, no-token, worker error) so a regression in the flow stands
  // out immediately.

  it('shows the no-token state when the URL lacks ?token=', async () => {
    renderAccept('/teams/accept');
    await waitFor(() => {
      expect(screen.getByText(/no invite token in the URL/i)).toBeInTheDocument();
    });
    // acceptInvite must NOT be called.
    expect(screen.queryByTestId('team-accept-success')).toBeNull();
    expect(screen.queryByTestId('team-accept-error')).toBeNull();
  });

  it('auto-POSTs the token + renders the success card on accept', async () => {
    const spy = vi.spyOn(teamsClient, 'acceptInvite').mockResolvedValue({
      ownerUserId: 'user_owner',
      memberEmail: 'sous@k.uk',
    });
    renderAccept('/teams/accept?token=tok_abc');

    await waitFor(() => {
      expect(screen.getByTestId('team-accept-success')).toBeInTheDocument();
    });
    expect(spy).toHaveBeenCalledWith('tok_abc');
    expect(screen.getByText(/sous@k.uk/)).toBeInTheDocument();
    // Browse-recipes CTA leads to /recipes (the shared library).
    expect(screen.getByRole('link', { name: /browse shared recipes/i }))
      .toHaveAttribute('href', '/recipes');
  });

  it('surfaces a worker error (e.g. 403 email-mismatch) in the error region — chef sees the actual reason', async () => {
    vi.spyOn(teamsClient, 'acceptInvite').mockRejectedValue(
      new teamsClient.TeamsClientError('Sign in as sous@k.uk to accept this invite', 403),
    );
    renderAccept('/teams/accept?token=tok_abc');
    await waitFor(() => {
      expect(screen.getByTestId('team-accept-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('team-accept-error')).toHaveTextContent(
      /sign in as sous@k.uk/i,
    );
  });
});
