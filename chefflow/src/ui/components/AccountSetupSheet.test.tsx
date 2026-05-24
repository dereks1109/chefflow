import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { clerkMockSignedIn } from '../../test-helpers/clerkMock';

vi.mock('@clerk/clerk-react', () => clerkMockSignedIn('user_setup_test'));

import AccountSetupSheet from './AccountSetupSheet';
import { db } from '../../db/dexie';
import { getPrefs } from '../../db/prefsRepo';
import { setCurrentUserId } from '../../state/currentUser';
import { useUnitSystemStore } from '../../state/unitSystemStore';

beforeEach(async () => {
  await db.userPrefs.clear();
  setCurrentUserId('user_setup_test');
  useUnitSystemStore.setState({ system: 'auto' });
});

describe('AccountSetupSheet', () => {
  it('renders the three sections when open', () => {
    render(<AccountSetupSheet open={true} onClose={() => {}} />);
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /unit system/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /head chef/i })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<AccountSetupSheet open={false} onClose={() => {}} />);
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  it('Save persists fields with onboardedAt and updates the unit store', async () => {
    const onClose = vi.fn();
    render(<AccountSetupSheet open={true} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('radio', { name: /metric/i }));
    fireEvent.click(screen.getByRole('button', { name: /sous chef/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const row = await getPrefs();
    expect(row?.displayName).toBe('Alex');
    expect(row?.kitchenRole).toBe('Sous chef');
    expect(row?.unitSystem).toBe('metric');
    expect(row?.onboardedAt).toBeGreaterThan(0);
    expect(row?.onboardSkippedAt).toBeUndefined();
    expect(useUnitSystemStore.getState().system).toBe('metric');
  });

  it('Skip stamps onboardSkippedAt without setting onboardedAt', async () => {
    const onClose = vi.fn();
    render(<AccountSetupSheet open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const row = await getPrefs();
    expect(row?.onboardSkippedAt).toBeGreaterThan(0);
    expect(row?.onboardedAt).toBeUndefined();
  });

  it('Other reveals a custom role input and saves the typed value', async () => {
    const onClose = vi.fn();
    render(<AccountSetupSheet open={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /^other$/i }));
    const customInput = screen.getByLabelText(/custom kitchen role/i);
    fireEvent.change(customInput, { target: { value: 'Pastry chef' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const row = await getPrefs();
    expect(row?.kitchenRole).toBe('Pastry chef');
  });

  it('prefills from initialPrefs when re-opened from the user menu', () => {
    render(
      <AccountSetupSheet
        open={true}
        onClose={() => {}}
        initialPrefs={{
          id: 'user_setup_test',
          ownerId: 'user_setup_test',
          unitSystem: 'imperial',
          updatedAt: Date.now(),
          displayName: 'Existing Name',
          kitchenRole: 'Line cook',
        }}
      />
    );
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Existing Name');
    expect(screen.getByRole('radio', { name: /imperial/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('button', { name: /line cook/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
