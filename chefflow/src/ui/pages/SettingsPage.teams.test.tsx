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

describe('SettingsPage — TeamMembersSection (T3c Phase 5)', () => {
  // Why these matter: the Team members section is the ONLY UI surface
  // through which Enterprise owners invite + manage team members. A
  // regression here strands the entire feature (members can't be added,
  // can't be removed, no error feedback). Tests pin the tier gate, the
  // invite happy path, and error surfacing.

  it('does NOT render the section for non-Enterprise tiers (free / pro / business stay clean)', async () => {
    useTierStore.setState({ tier: 'free' });
    const listSpy = vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderSettingsPlan();
    // Wait for the page-level tablist to mount, then assert the
    // section is absent. We deliberately don't depend on which tab is
    // active (URL search-param wiring isn't part of this test's intent).
    await waitFor(() => {
      expect(screen.getByTestId('settings-tabs')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('settings-team-members-section')).toBeNull();
    // listMembers must NOT be called for non-Enterprise users — saves a
    // wasted round-trip + avoids a spurious 401 error toast.
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('renders the section + empty-state for an Enterprise owner with no invites yet', async () => {
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    renderSettingsPlan();
    await waitFor(() => {
      expect(screen.getByTestId('settings-team-members-section')).toBeInTheDocument();
    });
    expect(await screen.findByTestId('settings-team-empty')).toBeInTheDocument();
    expect(screen.getByTestId('settings-team-invite-email')).toBeInTheDocument();
  });

  it('inviting a member calls teamsClient + refreshes the list', async () => {
    const listSpy = vi
      .spyOn(teamsClient, 'listMembers')
      .mockResolvedValueOnce([]) // initial load
      .mockResolvedValueOnce([
        { member_email: 'sous@k.uk', member_user_id: null, role: 'viewer', invited_at: 1, accepted_at: null },
      ]);
    const inviteSpy = vi.spyOn(teamsClient, 'inviteMember').mockResolvedValue({
      email: 'sous@k.uk',
      token: 'tok_x',
      acceptUrl: 'https://chefflow.uk/teams/accept?token=tok_x',
      emailStatus: 'sent',
    });

    renderSettingsPlan();
    await waitFor(() => screen.getByTestId('settings-team-invite-email'));
    await userEvent.type(screen.getByTestId('settings-team-invite-email'), 'sous@k.uk');
    await userEvent.click(screen.getByTestId('settings-team-invite-submit'));

    await waitFor(() => {
      expect(inviteSpy).toHaveBeenCalledWith('sous@k.uk');
    });
    // Status pill shows the email-sent confirmation.
    expect(await screen.findByTestId('settings-team-invite-status')).toHaveTextContent(/email sent/i);
    // List re-pulled → row visible.
    expect(await screen.findByTestId('settings-team-row-sous@k.uk')).toBeInTheDocument();
    expect(listSpy).toHaveBeenCalledTimes(2);
  });

  it('surfaces the seat-cap error from the worker verbatim — chef sees actionable feedback (Rule 12)', async () => {
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    vi.spyOn(teamsClient, 'inviteMember').mockRejectedValue(
      new teamsClient.TeamsClientError('Tier enterprise seat cap reached (50/50)', 409),
    );
    renderSettingsPlan();
    await waitFor(() => screen.getByTestId('settings-team-invite-email'));
    await userEvent.type(screen.getByTestId('settings-team-invite-email'), 'sous@k.uk');
    await userEvent.click(screen.getByTestId('settings-team-invite-submit'));

    expect(await screen.findByTestId('settings-team-invite-error'))
      .toHaveTextContent(/seat cap reached/i);
  });

  it('shows the copy-paste accept URL when email send is skipped (no Resend key)', async () => {
    vi.spyOn(teamsClient, 'listMembers').mockResolvedValue([]);
    vi.spyOn(teamsClient, 'inviteMember').mockResolvedValue({
      email: 'sous@k.uk',
      token: 'tok_x',
      acceptUrl: 'https://chefflow.uk/teams/accept?token=tok_x',
      emailStatus: 'skipped-no-key',
    });
    renderSettingsPlan();
    await waitFor(() => screen.getByTestId('settings-team-invite-email'));
    await userEvent.type(screen.getByTestId('settings-team-invite-email'), 'sous@k.uk');
    await userEvent.click(screen.getByTestId('settings-team-invite-submit'));

    const status = await screen.findByTestId('settings-team-invite-status');
    expect(status).toHaveTextContent(/email send disabled/i);
    expect(status.querySelector('a')?.getAttribute('href')).toBe(
      'https://chefflow.uk/teams/accept?token=tok_x',
    );
  });
});
