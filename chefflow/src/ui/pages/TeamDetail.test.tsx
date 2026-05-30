import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TeamDetail from './TeamDetail';
import { useTierStore } from '../../state/useTierStore';
import * as teamsClient from '../../core/teams/teamsClient';

beforeEach(() => {
  vi.restoreAllMocks();
  useTierStore.setState({ tier: 'enterprise' });
});

function renderDetail(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/teams/${id}`]}>
      <Routes>
        <Route path="/teams/:id" element={<TeamDetail />} />
        <Route path="/teams" element={<div data-testid="teams-list-stub" />} />
        <Route path="/recipes" element={<div data-testid="recipes-redirect" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TeamDetail (T5)', () => {
  // Why these matter: this is the only UI for inviting members + the
  // chef's exit ramp via delete. A regression here either strands
  // invites (members can't be added) or worse — silently fails the
  // delete (chef thinks the team's gone, it isn't).

  it('redirects non-Enterprise tiers to /recipes', async () => {
    useTierStore.setState({ tier: 'free' });
    renderDetail('grp_x');
    expect(await screen.findByTestId('recipes-redirect')).toBeInTheDocument();
  });

  it('shows a not-found state when the team id does NOT belong to the chef', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderDetail('grp_someone_elses');
    expect(await screen.findByText(/team not found/i)).toBeInTheDocument();
  });

  it('inviting a member calls inviteMember with the team\'s id + refreshes the list', async () => {
    vi.spyOn(teamsClient, 'listGroups')
      .mockResolvedValueOnce([{ id: 'grp_morning', name: 'Morning', isDefault: false }])
      .mockResolvedValueOnce([{ id: 'grp_morning', name: 'Morning', isDefault: false }]);
    vi.spyOn(teamsClient, 'listMembers')
      .mockResolvedValueOnce([]) // initial
      .mockResolvedValueOnce([
        { member_email: 'sous@k.uk', member_user_id: null, role: 'viewer', invited_at: 1, accepted_at: null, group_id: 'grp_morning' },
      ]);
    const inviteSpy = vi.spyOn(teamsClient, 'inviteMember').mockResolvedValue({
      email: 'sous@k.uk',
      token: 'tok_long_enough',
      acceptUrl: 'https://chefflow.uk/teams/accept?token=tok_long_enough',
      emailStatus: 'sent',
    });

    renderDetail('grp_morning');
    const emailInput = await screen.findByTestId('team-detail-invite-email');
    await userEvent.type(emailInput, 'sous@k.uk');
    await userEvent.click(screen.getByTestId('team-detail-invite-submit'));

    await waitFor(() => {
      expect(inviteSpy).toHaveBeenCalledWith('sous@k.uk', { groupId: 'grp_morning' });
    });
    expect(await screen.findByTestId('team-detail-invite-status')).toHaveTextContent(/email sent/i);
    expect(await screen.findByTestId('team-detail-row-sous@k.uk')).toBeInTheDocument();
  });

  it('clicking Delete team calls deleteGroup + navigates back to /teams', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_morning', name: 'Morning', isDefault: false },
    ]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    const deleteSpy = vi.spyOn(teamsClient, 'deleteGroup').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderDetail('grp_morning');
    await screen.findByTestId('team-detail-name');
    await userEvent.click(screen.getByTestId('team-detail-delete-team'));

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('grp_morning');
    });
    expect(await screen.findByTestId('teams-list-stub')).toBeInTheDocument();
  });

  it('renaming a team calls renameGroup + refreshes (Rename button hidden on legacy Default)', async () => {
    // Two-pass mock: initial list shows "Morning"; second list shows "Morning shift".
    vi.spyOn(teamsClient, 'listGroups')
      .mockResolvedValueOnce([{ id: 'grp_morning', name: 'Morning', isDefault: false }])
      .mockResolvedValueOnce([{ id: 'grp_morning', name: 'Morning shift', isDefault: false }]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    const renameSpy = vi.spyOn(teamsClient, 'renameGroup').mockResolvedValue({
      id: 'grp_morning', name: 'Morning shift',
    });

    renderDetail('grp_morning');
    await screen.findByTestId('team-detail-name');
    await userEvent.click(screen.getByTestId('team-detail-rename-button'));
    const input = screen.getByTestId('team-detail-rename-input') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, 'Morning shift');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(renameSpy).toHaveBeenCalledWith('grp_morning', 'Morning shift');
    });
    expect(await screen.findByText('Morning shift')).toBeInTheDocument();
  });
});
