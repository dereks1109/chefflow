import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EventEditor from './EventEditor';
import { db } from '../../db/dexie';
import type { KitchenEvent } from '../../core/types';

beforeEach(async () => {
  await db.events.clear();
});

const seed: KitchenEvent = {
  id: 'e_seed',
  title: 'Seed Event',
  serveAt: '2026-06-15T18:00:00.000Z',
  notes: '',
  sessions: [],
  dishes: [],
  createdAt: 1,
  updatedAt: 1,
};

function renderEditorAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/events/${id}/edit`]}>
      <Routes>
        <Route path="/events/:id/edit" element={<EventEditor />} />
        <Route path="/events/:id" element={<div>View</div>} />
        <Route path="/events" element={<div>Library</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EventEditor', () => {
  it('loads an existing event and shows its title', async () => {
    await db.events.put(seed);
    renderEditorAt(seed.id);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Seed Event')).toBeInTheDocument();
    });
  });

  it('shows not-found message for unknown event id', async () => {
    renderEditorAt('does-not-exist');
    await waitFor(() => {
      expect(screen.getByText(/event not found/i)).toBeInTheDocument();
    });
  });

  it('adds, edits, and persists a session on save', async () => {
    await db.events.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Event');

    await userEvent.click(screen.getByRole('button', { name: /add session/i }));
    const titleInput = screen.getByLabelText(/session 1 title/i);
    await userEvent.type(titleInput, 'Prep');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(async () => {
      const updated = await db.events.get(seed.id);
      expect(updated?.sessions).toHaveLength(1);
      expect(updated?.sessions[0].title).toBe('Prep');
    });
  });

  it('disables save when a session has end <= start', async () => {
    await db.events.put({
      ...seed,
      sessions: [{
        id: 's1', title: 'Bad', startAt: '2026-06-15T15:00:00.000Z',
        endAt: '2026-06-15T14:00:00.000Z', notes: '',
      }],
    });
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Event');
    const save = await screen.findByRole('button', { name: /^save$/i });
    expect(save).toBeDisabled();
    expect(screen.getByText(/end time must be after start time/i)).toBeInTheDocument();
  });
});
