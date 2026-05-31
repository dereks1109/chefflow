import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TeamsList from './TeamsList';
import { useTierStore } from '../../state/useTierStore';
import * as teamsClient from '../../core/teams/teamsClient';

beforeEach(() => {
  vi.restoreAllMocks();
  useTierStore.setState({ tier: 'enterprise' });
});

function renderTeams() {
  return render(
    <MemoryRouter initialEntries={['/teams']}>
      <Routes>
        <Route path="/teams" element={<TeamsList />} />
        <Route path="/teams/:id" element={<div data-testid="team-detail-stub" />} />
        <Route path="/recipes" element={<div data-testid="recipes-redirect" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TeamsList (T5, expanded T11)', () => {
  // Why these matter: this is the top-nav landing for the team-share
  // feature. T11 made the page available to every signed-in chef
  // (not just Enterprise) so team MEMBERS can see what they're in.
  // Tests pin the role-aware rendering (Manage vs View, member-empty
  // vs owner-empty copy) and that the "+ New team" button is
  // gated to Enterprise only.

  it('shows the member-only empty-state copy + hides "+ New team" for non-Enterprise chefs with no memberships', async () => {
    useTierStore.setState({ tier: 'free' });
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([]);
    renderTeams();
    expect(await screen.findByTestId('teams-empty-state')).toHaveTextContent(/not in any team yet/i);
    expect(screen.queryByTestId('teams-new-team-button')).toBeNull();
  });

  it('shows the owner empty-state with a Create-your-first-team CTA for Enterprise chefs with no teams', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderTeams();
    expect(await screen.findByTestId('teams-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first team/i })).toBeInTheDocument();
  });

  it('lists owner-role teams with member counts derived from listMembers', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_morning', name: 'Morning shift', isDefault: false, role: 'owner', ownerUserId: 'u_me' },
      { id: 'grp_evening', name: 'Evening shift', isDefault: false, role: 'owner', ownerUserId: 'u_me' },
    ]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([
      { member_email: 'a@x', member_user_id: 'u_a', role: 'viewer', invited_at: 1, accepted_at: 2, group_id: 'grp_morning' },
      { member_email: 'b@x', member_user_id: 'u_b', role: 'viewer', invited_at: 1, accepted_at: 2, group_id: 'grp_morning' },
      { member_email: 'c@x', member_user_id: 'u_c', role: 'viewer', invited_at: 1, accepted_at: null, group_id: 'grp_evening' },
    ]);
    renderTeams();
    expect(await screen.findByTestId('teams-card-grp_morning')).toHaveTextContent('2 members');
    expect(screen.getByTestId('teams-card-grp_evening')).toHaveTextContent('1 member');
  });

  it('clicking + New team opens the modal, creating a team navigates to /teams/:id', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    const createSpy = vi.spyOn(teamsClient, 'createGroup').mockResolvedValue({
      id: 'grp_new', name: 'Morning shift', isDefault: false, role: 'owner', ownerUserId: 'u_me',
    });
    renderTeams();
    await screen.findByTestId('teams-empty-state');
    await userEvent.click(screen.getByTestId('teams-new-team-button'));
    await userEvent.type(screen.getByTestId('teams-create-name-input'), 'Morning shift');
    await userEvent.click(screen.getByTestId('teams-create-submit'));
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith('Morning shift');
    });
    expect(await screen.findByTestId('team-detail-stub')).toBeInTheDocument();
  });

  it('surfaces the worker\'s 409 error inline in the create modal (duplicate name)', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    vi.spyOn(teamsClient, 'createGroup').mockRejectedValue(
      new teamsClient.TeamsClientError('A group with that name already exists', 409),
    );
    renderTeams();
    await screen.findByTestId('teams-empty-state');
    await userEvent.click(screen.getByTestId('teams-new-team-button'));
    await userEvent.type(screen.getByTestId('teams-create-name-input'), 'Morning');
    await userEvent.click(screen.getByTestId('teams-create-submit'));
    expect(await screen.findByTestId('teams-create-error')).toHaveTextContent(/already exists/i);
  });

  it('T11 — non-Enterprise chef with a member-role team sees a View card + no New team button + no listMembers call', async () => {
    useTierStore.setState({ tier: 'free' });
    const groupsSpy = vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_shared', name: "Anna's Kitchen", isDefault: false, role: 'member', ownerUserId: 'u_anna' },
    ]);
    const membersSpy = vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderTeams();
    const card = await screen.findByTestId('teams-card-grp_shared');
    expect(card).toHaveTextContent(/Anna's Kitchen/);
    // Member card: "Shared team" subtext + "View →" CTA, not the
    // owner-only "Manage →" / member-count copy.
    expect(card).toHaveTextContent(/Shared team/);
    expect(card).toHaveTextContent(/View/);
    expect(screen.queryByTestId('teams-new-team-button')).toBeNull();
    expect(groupsSpy).toHaveBeenCalledTimes(1);
    // listMembers is skipped because the caller owns no groups —
    // worker would reject the call anyway for pure-member callers.
    expect(membersSpy).not.toHaveBeenCalled();
  });
});
