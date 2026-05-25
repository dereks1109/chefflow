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
