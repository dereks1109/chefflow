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

describe('TeamsList (T5)', () => {
  // Why these matter: this is the top-nav landing for the team-share
  // feature. A regression here strands the chef before they can create
  // a team. Tests pin the tier-redirect, empty-state CTA, and the
  // create-then-navigate-to-detail flow.

  it('redirects non-Enterprise tiers to /recipes (no dead-end page)', async () => {
    useTierStore.setState({ tier: 'free' });
    const groupsSpy = vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([]);
    const membersSpy = vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderTeams();
    await waitFor(() => {
      expect(screen.getByTestId('recipes-redirect')).toBeInTheDocument();
    });
    expect(groupsSpy).not.toHaveBeenCalled();
    expect(membersSpy).not.toHaveBeenCalled();
  });

  it('shows empty-state when the chef has no teams yet, with a Create-your-first-team CTA', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderTeams();
    expect(await screen.findByTestId('teams-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first team/i })).toBeInTheDocument();
  });

  it('lists existing teams as cards with member counts derived from listMembers', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_morning', name: 'Morning shift', isDefault: false },
      { id: 'grp_evening', name: 'Evening shift', isDefault: false },
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
      id: 'grp_new', name: 'Morning shift', isDefault: false,
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
});
