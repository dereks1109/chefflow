import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupShareChipRow from './GroupShareChipRow';
import { useTierStore } from '../../state/useTierStore';
import * as groupsCache from '../../core/teams/groupsCache';

beforeEach(() => {
  vi.restoreAllMocks();
  useTierStore.setState({ tier: 'enterprise' });
});

describe('GroupShareChipRow (T4 Phase 3)', () => {
  // Why these matter: this is the only UI surface where the chef ticks
  // which groups a recipe/event/menu is shared with. Getting the
  // toggling wrong leaks items between groups; getting the tier gate
  // wrong shows the chip row to free-tier chefs who have no team.

  it('renders nothing for non-Enterprise tiers (no team → no need to choose groups)', () => {
    useTierStore.setState({ tier: 'free' });
    const onChange = vi.fn();
    const { container } = render(
      <GroupShareChipRow selectedGroupIds={undefined} onChange={onChange} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when readOnly is true (caller is viewing a shared row, not the owner)', () => {
    vi.spyOn(groupsCache, 'getGroupsCached').mockResolvedValue([
      { id: 'grp_default', name: 'Default', isDefault: true },
    ]);
    const { container } = render(
      <GroupShareChipRow selectedGroupIds={['grp_default']} onChange={vi.fn()} readOnly />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per group, with Default pre-selected when selectedGroupIds is undefined', async () => {
    vi.spyOn(groupsCache, 'getGroupsCached').mockResolvedValue([
      { id: 'grp_default', name: 'Default', isDefault: true },
      { id: 'grp_morning', name: 'Morning shift', isDefault: false },
    ]);
    render(<GroupShareChipRow selectedGroupIds={undefined} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('group-share-chip-row')).toBeInTheDocument();
    });
    expect(screen.getByTestId('group-share-chip-grp_default')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('group-share-chip-grp_morning')).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a chip calls onChange with the FULL next array (toggling that group in/out)', async () => {
    vi.spyOn(groupsCache, 'getGroupsCached').mockResolvedValue([
      { id: 'grp_default', name: 'Default', isDefault: true },
      { id: 'grp_morning', name: 'Morning shift', isDefault: false },
    ]);
    const onChange = vi.fn();
    render(
      <GroupShareChipRow selectedGroupIds={['grp_default']} onChange={onChange} />,
    );

    await waitFor(() => screen.getByTestId('group-share-chip-grp_morning'));
    await userEvent.click(screen.getByTestId('group-share-chip-grp_morning'));
    expect(onChange).toHaveBeenCalledWith(['grp_default', 'grp_morning']);

    // Clicking an already-selected chip toggles it OFF.
    onChange.mockClear();
    await userEvent.click(screen.getByTestId('group-share-chip-grp_default'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('renders nothing when the owner has zero groups (corner case: just downgraded, default exists but worker returned [])', async () => {
    vi.spyOn(groupsCache, 'getGroupsCached').mockResolvedValue([]);
    const { container } = render(
      <GroupShareChipRow selectedGroupIds={undefined} onChange={vi.fn()} />,
    );
    // Effect resolves to empty list → row stays absent.
    await waitFor(() => {
      // Once the promise settles, the component will re-render with
      // groups=[]; the early-return then bails. Container stays empty.
      expect(container.firstChild).toBeNull();
    });
  });
});
