import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EventsLibrary from './EventsLibrary';
import { db } from '../../db/dexie';
import { setCurrentUserId } from '../../state/currentUser';
import type { KitchenEvent } from '../../core/types';

const TEST_USER = 'user_page_test';

beforeEach(async () => {
  await db.events.clear();
  setCurrentUserId(TEST_USER);
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
  ownerId: TEST_USER,
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
      // Soft-delete: tombstone stays in IndexedDB; UI shows empty state.
      await waitFor(() => {
        expect(screen.getByText(/no events yet/i)).toBeInTheDocument();
      });
      const raw = await db.events.get('e_test_001');
      expect(raw?.deletedAt).toBeGreaterThan(0);
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
