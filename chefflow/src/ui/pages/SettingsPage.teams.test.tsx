import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SettingsPage from './SettingsPage';
import { useTierStore } from '../../state/useTierStore';
import * as teamsClient from '../../core/teams/teamsClient';

beforeEach(() => {
  vi.restoreAllMocks();
  // Default to Enterprise tier so the section renders. Individual tests
  // override to 'free' to assert the section hides.
  useTierStore.setState({ tier: 'enterprise' });
});

function renderSettingsPlan() {
  return render(
    <MemoryRouter initialEntries={['/settings?tab=plan']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SettingsPage — TeamsSection (T4 Phase 2: per-group panels)', () => {
  // Why these matter: TeamsSection is the only UI surface through
  // which Enterprise owners manage groups + invite members. A
  // regression here strands the entire team-share feature. Tests pin
  // the tier gate, group-scoped invite, group create + rename + delete
  // affordances + the Default group's protected status.

  it('does NOT render the section for non-Enterprise tiers + does NOT call list endpoints', async () => {
    useTierStore.setState({ tier: 'free' });
    const groupsSpy = vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([]);
    const membersSpy = vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderSettingsPlan();
    await waitFor(() => {
      expect(screen.getByTestId('settings-tabs')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('settings-teams-section')).toBeNull();
    expect(groupsSpy).not.toHaveBeenCalled();
    expect(membersSpy).not.toHaveBeenCalled();
  });

  it('renders the Default group panel + new-group form for an Enterprise owner with no extra groups', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_default', name: 'Default', isDefault: true },
    ]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderSettingsPlan();

    expect(await screen.findByTestId('settings-teams-group-grp_default')).toBeInTheDocument();
    expect(screen.getByTestId('settings-teams-group-name-grp_default')).toHaveTextContent('Default');
    expect(screen.getByTestId('settings-teams-empty-grp_default')).toBeInTheDocument();
    expect(screen.getByTestId('settings-teams-new-group-form')).toBeInTheDocument();
    // Default group panel: NO Rename, NO Delete button (it's protected).
    expect(screen.queryByTestId('settings-teams-rename-grp_default')).toBeNull();
    expect(screen.queryByTestId('settings-teams-delete-grp_default')).toBeNull();
  });

  it('inviting into the Default panel calls inviteMember with that group\'s id', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_default', name: 'Default', isDefault: true },
    ]);
    vi.spyOn(teamsClient, 'listMembers')
      .mockResolvedValueOnce([]) // initial load
      .mockResolvedValueOnce([
        { member_email: 'sous@k.uk', member_user_id: null, role: 'viewer', invited_at: 1, accepted_at: null, group_id: 'grp_default' },
      ]); // after refresh
    const inviteSpy = vi.spyOn(teamsClient, 'inviteMember').mockResolvedValue({
      email: 'sous@k.uk',
      token: 'tok_long_enough',
      acceptUrl: 'https://chefflow.uk/teams/accept?token=tok_long_enough',
      emailStatus: 'sent',
    });

    renderSettingsPlan();
    const emailInput = await screen.findByTestId('settings-teams-invite-email-grp_default');
    await userEvent.type(emailInput, 'sous@k.uk');
    await userEvent.click(screen.getByTestId('settings-teams-invite-submit-grp_default'));

    await waitFor(() => {
      expect(inviteSpy).toHaveBeenCalledWith('sous@k.uk', { groupId: 'grp_default' });
    });
    expect(await screen.findByTestId('settings-teams-invite-status-grp_default')).toHaveTextContent(/email sent/i);
    expect(await screen.findByTestId('settings-teams-row-sous@k.uk')).toBeInTheDocument();
  });

  it('renders a non-default group panel with Rename + Delete affordances + scoped invite form', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_default', name: 'Default', isDefault: true },
      { id: 'grp_morning', name: 'Morning shift', isDefault: false },
    ]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([
      { member_email: 'sous@k.uk', member_user_id: 'u_s', role: 'viewer', invited_at: 1, accepted_at: 2, group_id: 'grp_morning' },
    ]);
    renderSettingsPlan();

    expect(await screen.findByTestId('settings-teams-group-grp_morning')).toBeInTheDocument();
    expect(screen.getByTestId('settings-teams-group-name-grp_morning')).toHaveTextContent('Morning shift');
    expect(screen.getByTestId('settings-teams-rename-grp_morning')).toBeInTheDocument();
    expect(screen.getByTestId('settings-teams-delete-grp_morning')).toBeInTheDocument();
    // Member appears under the Morning group's list, not Default.
    const morningList = screen.getByTestId('settings-teams-list-grp_morning');
    expect(morningList).toHaveTextContent('sous@k.uk');
  });

  it('creating a new group calls createGroup + refreshes the panel list', async () => {
    const groupsSpy = vi.spyOn(teamsClient, 'listGroups')
      .mockResolvedValueOnce([{ id: 'grp_default', name: 'Default', isDefault: true }])
      .mockResolvedValueOnce([
        { id: 'grp_default', name: 'Default', isDefault: true },
        { id: 'grp_new', name: 'Evening shift', isDefault: false },
      ]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    const createSpy = vi.spyOn(teamsClient, 'createGroup').mockResolvedValue({
      id: 'grp_new', name: 'Evening shift', isDefault: false,
    });

    renderSettingsPlan();
    const input = await screen.findByTestId('settings-teams-new-group-name');
    await userEvent.type(input, 'Evening shift');
    await userEvent.click(screen.getByTestId('settings-teams-new-group-submit'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith('Evening shift');
    });
    expect(await screen.findByTestId('settings-teams-group-grp_new')).toBeInTheDocument();
    expect(groupsSpy).toHaveBeenCalledTimes(2);
  });

  it('surfaces the worker\'s duplicate-name error verbatim on createGroup', async () => {
    vi.spyOn(teamsClient, 'listGroups').mockResolvedValue([
      { id: 'grp_default', name: 'Default', isDefault: true },
    ]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    vi.spyOn(teamsClient, 'createGroup').mockRejectedValue(
      new teamsClient.TeamsClientError('A group with that name already exists', 409),
    );
    renderSettingsPlan();
    const input = await screen.findByTestId('settings-teams-new-group-name');
    await userEvent.type(input, 'Default');
    await userEvent.click(screen.getByTestId('settings-teams-new-group-submit'));

    expect(await screen.findByTestId('settings-teams-action-error'))
      .toHaveTextContent(/already exists/i);
  });

  it('deleting a non-default group calls deleteGroup + refreshes', async () => {
    const groupsSpy = vi.spyOn(teamsClient, 'listGroups')
      .mockResolvedValueOnce([
        { id: 'grp_default', name: 'Default', isDefault: true },
        { id: 'grp_morning', name: 'Morning', isDefault: false },
      ])
      .mockResolvedValueOnce([
        { id: 'grp_default', name: 'Default', isDefault: true },
      ]);
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    const deleteSpy = vi.spyOn(teamsClient, 'deleteGroup').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSettingsPlan();
    await screen.findByTestId('settings-teams-group-grp_morning');
    await userEvent.click(screen.getByTestId('settings-teams-delete-grp_morning'));

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('grp_morning');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('settings-teams-group-grp_morning')).toBeNull();
    });
    expect(groupsSpy).toHaveBeenCalledTimes(2);
  });
});
