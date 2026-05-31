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

  it('T11 — non-Enterprise chef can land on /teams/:id and see member-only chrome (no rename / invite / delete)', async () => {
    useTierStore.setState({ tier: 'free' });
    // Worker returns the team with role='member' for the caller —
    // their accepted membership row joined to the owner's group.
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_shared', name: "Anna's Kitchen", isDefault: false, role: 'member', ownerUserId: 'u_anna' },
    ]);
    const listMembersSpy = vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderDetail('grp_shared');
    // Team name renders, member notice replaces the owner chrome.
    expect(await screen.findByTestId('team-detail-name')).toHaveTextContent("Anna's Kitchen");
    expect(screen.getByTestId('team-detail-member-notice')).toBeInTheDocument();
    // None of the owner-only write surfaces render.
    expect(screen.queryByTestId('team-detail-rename-button')).toBeNull();
    expect(screen.queryByTestId('team-detail-invite-email')).toBeNull();
    expect(screen.queryByTestId('team-detail-delete-team')).toBeNull();
    // Worker rejects member callers asking for the owner's roster,
    // so the SPA must skip the listMembers call entirely.
    expect(listMembersSpy).not.toHaveBeenCalled();
  });

  it('shows a not-found state when the team id does NOT belong to the chef', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderDetail('grp_someone_elses');
    expect(await screen.findByText(/team not found/i)).toBeInTheDocument();
  });

  it('inviting a member calls inviteMember with the team\'s id + refreshes the list', async () => {
    vi.spyOn(teamsClient, 'listGroups')
      .mockResolvedValueOnce([{ id: 'grp_morning', name: 'Morning', isDefault: false, role: 'owner', ownerUserId: 'u_me' }])
      .mockResolvedValueOnce([{ id: 'grp_morning', name: 'Morning', isDefault: false, role: 'owner', ownerUserId: 'u_me' }]);
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
      { id: 'grp_morning', name: 'Morning', isDefault: false, role: 'owner', ownerUserId: 'u_me' },
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
      .mockResolvedValueOnce([{ id: 'grp_morning', name: 'Morning', isDefault: false, role: 'owner', ownerUserId: 'u_me' }])
      .mockResolvedValueOnce([{ id: 'grp_morning', name: 'Morning shift', isDefault: false, role: 'owner', ownerUserId: 'u_me' }]);
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

describe('TeamDetail — tabs (T6)', () => {
  // Why these matter: the 3-tab nav is the chef's primary way to see
  // what's shared with this specific team. A regression that hides a
  // tab or leaks across teams strands the share visibility.

  it('renders the 3 tab triggers + defaults to Details when ?tab is missing', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_morning', name: 'Morning shift', isDefault: false, role: 'owner', ownerUserId: 'u_me' },
    ]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderDetail('grp_morning');

    expect(await screen.findByTestId('team-detail-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('team-detail-tab-details')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('team-detail-tab-recipes')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('team-detail-tab-events')).toHaveAttribute('aria-selected', 'false');
    // Details body is rendered (invite form visible).
    expect(screen.getByTestId('team-detail-invite-email')).toBeInTheDocument();
  });

  it('Shared recipes tab shows only recipes whose sharedWithGroupIds includes this team', async () => {
    // Seed Dexie with mixed-team recipes; only the one tagged for
    // grp_morning should show on this team's Recipes tab.
    const { db } = await import('../../db/dexie');
    await db.recipes.clear();
    // Seeded without userId so listRecipes treats them as legacy/
    // visible-to-current-user (matches the existing test fixtures).
    await db.recipes.bulkPut([
      { id: 'r1', title: 'Morning Lamb',  originalYield: 1, ingredients: [], steps: [], createdAt: 0, updatedAt: 0, sharedWithGroupIds: ['grp_morning'] } as never,
      { id: 'r2', title: 'Evening Stock', originalYield: 1, ingredients: [], steps: [], createdAt: 0, updatedAt: 0, sharedWithGroupIds: ['grp_evening'] } as never,
      { id: 'r3', title: 'Private Cake',  originalYield: 1, ingredients: [], steps: [], createdAt: 0, updatedAt: 0 } as never,
    ]);
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_morning', name: 'Morning shift', isDefault: false, role: 'owner', ownerUserId: 'u_me' },
    ]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderDetail('grp_morning');

    await screen.findByTestId('team-detail-tabs');
    await userEvent.click(screen.getByTestId('team-detail-tab-recipes'));

    await waitFor(() => {
      expect(screen.getByTestId('team-detail-shared-recipes')).toBeInTheDocument();
    });
    expect(screen.getByText('Morning Lamb')).toBeInTheDocument();
    expect(screen.queryByText('Evening Stock')).toBeNull();
    expect(screen.queryByText('Private Cake')).toBeNull();
  });

  it('Shared events tab shows only events whose sharedWithGroupIds includes this team', async () => {
    const { db } = await import('../../db/dexie');
    await db.events.clear();
    await db.events.bulkPut([
      { id: 'e1', title: 'Morning Brunch', notes: '', dishes: [], createdAt: 0, updatedAt: 0, sharedWithGroupIds: ['grp_morning'] } as never,
      { id: 'e2', title: 'Evening Banquet', notes: '', dishes: [], createdAt: 0, updatedAt: 0, sharedWithGroupIds: ['grp_evening'] } as never,
    ]);
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_morning', name: 'Morning shift', isDefault: false, role: 'owner', ownerUserId: 'u_me' },
    ]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderDetail('grp_morning');

    await screen.findByTestId('team-detail-tabs');
    await userEvent.click(screen.getByTestId('team-detail-tab-events'));

    await waitFor(() => {
      expect(screen.getByTestId('team-detail-shared-events')).toBeInTheDocument();
    });
    expect(screen.getByText('Morning Brunch')).toBeInTheDocument();
    expect(screen.queryByText('Evening Banquet')).toBeNull();
  });
});
