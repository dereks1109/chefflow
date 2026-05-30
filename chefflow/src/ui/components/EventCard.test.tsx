import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventCard from './EventCard';
import type { KitchenEvent } from '../../core/types';

// T8 — the two cards in the chef's library MUST line up visually
// regardless of whether the event has a workflow or notes filled in.
// Pre-T8 the workflow row + description paragraph were conditionally
// hidden, collapsing card height, so a freshly-created "Untitled
// event" sat noticeably shorter than a fully-populated Demo Event.
// These specs pin the always-render placeholder behaviour so the grid
// stays uniform.

const baseEvent: KitchenEvent = {
  id: 'e_test_001',
  title: 'Demo Event',
  serveAt: '2026-05-14T18:00:00.000Z',
  dishes: [{ id: 'd_1', recipeId: 'r_1', name: 'Stew', portions: 4, startAt: '2026-05-14T17:00:00.000Z' }],
  notes: '8 guests for a birthday dinner.',
  workflow: [{ id: 's_1', label: 'Brown the beef', minutes: 5 }] as never,
  createdAt: 1,
  updatedAt: 1,
};

function renderCard(event: KitchenEvent) {
  return render(
    <MemoryRouter>
      <EventCard event={event} onDelete={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('EventCard (T8 layout placeholders)', () => {
  it('renders the workflow + description rows when both are present', () => {
    renderCard(baseEvent);
    expect(screen.getByText(/Workflow · 1 step/)).toBeInTheDocument();
    expect(screen.getByText('8 guests for a birthday dinner.')).toBeInTheDocument();
  });

  it('still renders the workflow row as a "No workflow yet" placeholder when workflow is empty', () => {
    renderCard({ ...baseEvent, workflow: undefined, notes: '', title: '' });
    expect(screen.getByText(/No workflow yet/i)).toBeInTheDocument();
  });

  it('still renders the description slot as a "No description" placeholder when notes is empty', () => {
    renderCard({ ...baseEvent, workflow: undefined, notes: '', title: '' });
    expect(screen.getByText(/No description/i)).toBeInTheDocument();
  });

  it('falls back to "Untitled event" when title is empty', () => {
    renderCard({ ...baseEvent, title: '' });
    expect(screen.getByRole('link', { name: 'Untitled event' })).toBeInTheDocument();
  });
});
