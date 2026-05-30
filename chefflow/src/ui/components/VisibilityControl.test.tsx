import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import VisibilityControl from './VisibilityControl';
import { useTierStore } from '../../state/useTierStore';
import * as groupsCache from '../../core/teams/groupsCache';

beforeEach(() => {
  vi.restoreAllMocks();
  useTierStore.setState({ tier: 'enterprise' });
});

function renderControl(node: React.ReactNode) {
  // The control renders a react-router Link in the empty-state path
  // (T8 — "Create a team"), so every test path needs a Router in scope.
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('VisibilityControl (T5 Phase B)', () => {
  // Why these matter: this row is the chef's single decision point for
  // who sees a recipe / event / menu. Misrouting a tick → leaked items
  // between teams. Misrouting the Community checkbox → unwanted public
  // publish. Tests pin the tier gating + the per-pill toggle semantics.

  it('renders nothing when readOnly is true (viewer can\'t change owner\'s sharing)', () => {
    vi.spyOn(groupsCache, 'getGroupsCached').mockResolvedValue([
      { id: 'grp_a', name: 'Team A', isDefault: false },
    ]);
    const { container } = renderControl(
      <VisibilityControl
        selectedGroupIds={['grp_a']}
        community={{ checked: true, onChange: vi.fn() }}
        onGroupsChange={vi.fn()}
        readOnly
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for non-Enterprise without a community pill (Event / Menu callers)', () => {
    useTierStore.setState({ tier: 'free' });
    const { container } = renderControl(
      <VisibilityControl
        selectedGroupIds={undefined}
        onGroupsChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders JUST the Community pill for non-Enterprise on a recipe (any chef can publish to community)', () => {
    useTierStore.setState({ tier: 'free' });
    renderControl(
      <VisibilityControl
        selectedGroupIds={undefined}
        community={{ checked: false, onChange: vi.fn() }}
        onGroupsChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('visibility-control')).toBeInTheDocument();
    expect(screen.getByTestId('visibility-community')).toBeInTheDocument();
    expect(screen.queryByTestId(/^visibility-team-/)).toBeNull();
  });

  it('renders Community + one pill per team for Enterprise chefs', async () => {
    vi.spyOn(groupsCache, 'getGroupsCached').mockResolvedValue([
      { id: 'grp_a', name: 'Team A', isDefault: false },
      { id: 'grp_b', name: 'Team B', isDefault: false },
    ]);
    renderControl(
      <VisibilityControl
        selectedGroupIds={['grp_a']}
        community={{ checked: false, onChange: vi.fn() }}
        onGroupsChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('visibility-team-grp_a')).toBeInTheDocument();
    });
    expect(screen.getByTestId('visibility-community')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('visibility-team-grp_a')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('visibility-team-grp_b')).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking the Community pill toggles the community.checked boolean (debounced to handleSave at the editor)', async () => {
    vi.spyOn(groupsCache, 'getGroupsCached').mockResolvedValue([]);
    const onCommunityChange = vi.fn();
    renderControl(
      <VisibilityControl
        selectedGroupIds={undefined}
        community={{ checked: false, onChange: onCommunityChange }}
        onGroupsChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('visibility-community'));
    expect(onCommunityChange).toHaveBeenCalledWith(true);
  });

  it('clicking a team pill calls onGroupsChange with the full next array (toggle in/out)', async () => {
    vi.spyOn(groupsCache, 'getGroupsCached').mockResolvedValue([
      { id: 'grp_a', name: 'Team A', isDefault: false },
      { id: 'grp_b', name: 'Team B', isDefault: false },
    ]);
    const onGroupsChange = vi.fn();
    renderControl(
      <VisibilityControl
        selectedGroupIds={['grp_a']}
        community={{ checked: false, onChange: vi.fn() }}
        onGroupsChange={onGroupsChange}
      />,
    );
    await waitFor(() => screen.getByTestId('visibility-team-grp_b'));

    await userEvent.click(screen.getByTestId('visibility-team-grp_b'));
    expect(onGroupsChange).toHaveBeenCalledWith(['grp_a', 'grp_b']);

    onGroupsChange.mockClear();
    await userEvent.click(screen.getByTestId('visibility-team-grp_a'));
    expect(onGroupsChange).toHaveBeenCalledWith([]);
  });

  it('Enterprise chef with zero teams renders an inline "Create a team" link instead of self-hiding (T8 — events used to lose the row entirely)', async () => {
    vi.spyOn(groupsCache, 'getGroupsCached').mockResolvedValue([]);
    renderControl(
      <VisibilityControl
        selectedGroupIds={undefined}
        onGroupsChange={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('visibility-no-teams')).toBeInTheDocument();
    });
    expect(screen.getByTestId('visibility-no-teams')).toHaveAttribute('href', '/teams');
  });
});
