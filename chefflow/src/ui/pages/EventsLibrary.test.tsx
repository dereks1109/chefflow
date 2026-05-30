import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EventsLibrary from './EventsLibrary';
import { db } from '../../db/dexie';
import type { KitchenEvent } from '../../core/types';

beforeEach(async () => {
  await db.events.clear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <EventsLibrary />
    </MemoryRouter>
  );
}

const dinner: KitchenEvent = {
  id: 'e_test_001',
  title: "Sunday Dinner",
  serveAt: '2026-06-15T18:00:00.000Z',
  notes: 'Family',
  dishes: [],
  createdAt: 1,
  updatedAt: 1,
};

describe('EventsLibrary', () => {
  it('shows empty state when no events exist', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no events yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /create your first event/i })).toBeInTheDocument();
  });

  it('lists saved events', async () => {
    await db.events.put(dinner);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Sunday Dinner' })).toBeInTheDocument();
    });
  });

  it('deletes an event after confirm', async () => {
    await db.events.put(dinner);
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      renderPage();
      await waitFor(() => screen.getByText('Sunday Dinner'));
      await userEvent.click(screen.getByRole('button', { name: /delete event sunday dinner/i }));
      // Soft-delete: tombstone retained for sync. Check via listEvents, which
      // filters them out.
      const { listEvents } = await import('../../db/eventsRepo');
      await waitFor(async () => {
        expect((await listEvents()).length).toBe(0);
      });
    } finally {
      window.confirm = originalConfirm;
    }
  });
});

describe('EventsLibrary — Mine vs Shared scope filter (T3c follow-up)', () => {
  // Same rationale as RecipesLibrary: a chef on an Enterprise team needs
  // a clear way to filter out borrowed events from their own. Tests pin
  // the chip-row guard (hidden when no shared events), count derivation,
  // and the two filtering branches.

  it('does NOT render the chip row when the chef has zero shared events', async () => {
    await db.events.put(dinner);
    renderPage();
    await waitFor(() => screen.getByText('Sunday Dinner'));
    expect(screen.queryByTestId('events-scope-chip-row')).toBeNull();
  });

  it('renders the chip row + filters correctly when shared events are present', async () => {
    await db.events.bulkPut([
      dinner,
      { ...dinner, id: 'e_shared_1', title: "Owner's Wedding", readOnly: true, ownerUserId: 'user_owner' },
      { ...dinner, id: 'e_shared_2', title: "Owner's Pop-up", readOnly: true, ownerUserId: 'user_owner' },
    ]);
    renderPage();
    await waitFor(() => screen.getByTestId('events-scope-chip-row'));
    expect(screen.getByTestId('events-scope-all')).toHaveTextContent('All (3)');
    expect(screen.getByTestId('events-scope-mine')).toHaveTextContent('Mine (1)');
    expect(screen.getByTestId('events-scope-shared')).toHaveTextContent('Shared (2)');

    await userEvent.click(screen.getByTestId('events-scope-mine'));
    expect(screen.getByText('Sunday Dinner')).toBeInTheDocument();
    expect(screen.queryByText("Owner's Wedding")).toBeNull();

    await userEvent.click(screen.getByTestId('events-scope-shared'));
    expect(screen.queryByText('Sunday Dinner')).toBeNull();
    expect(screen.getByText("Owner's Wedding")).toBeInTheDocument();
    expect(screen.getByText("Owner's Pop-up")).toBeInTheDocument();
  });

  it('renders the team NAME on the shared-event tag, not the generic "Shared" label (T6)', async () => {
    await db.events.put({
      ...dinner,
      id: 'e_morning', title: "Owner's Brunch",
      readOnly: true, ownerUserId: 'user_owner',
      teamId: 'grp_morning', teamName: 'Morning shift',
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('event-card-shared-tag')).toHaveTextContent('Morning shift');
    });
  });
});
