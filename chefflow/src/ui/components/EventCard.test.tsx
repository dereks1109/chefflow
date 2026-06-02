import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventCard from './EventCard';
import type { KitchenEvent } from '../../core/types';

// T15 — EventCard redesign. State pills + lighter chrome + single-line
// meta. These specs pin the pill-derivation logic + the optional
// onDelete / linkTo props (used by WorkflowsLibrary to swap the link
// target). Earlier tests focused on text presence; this rewrite focuses
// on the state-derivation contract so a future tweak to "what counts as
// Upcoming" can't slip through silently.

const FUTURE = '2099-01-01T18:00:00.000Z';
const PAST = '2000-01-01T18:00:00.000Z';

const baseEvent: KitchenEvent = {
  id: 'e_test_001',
  title: 'Demo Event',
  serveAt: FUTURE,
  dishes: [{ id: 'd_1', recipeId: 'r_1', name: 'Stew', portions: 4, startAt: FUTURE }],
  notes: '8 guests for a birthday dinner.',
  workflow: [{ id: 's_1', label: 'Brown the beef', minutes: 5 }] as never,
  createdAt: 1,
  updatedAt: 1,
};

function renderCard(event: KitchenEvent, opts: { onDelete?: typeof vi.fn extends () => infer T ? T : never; linkTo?: (e: KitchenEvent) => string } = {}) {
  return render(
    <MemoryRouter>
      <EventCard
        event={event}
        onDelete={opts.onDelete as never}
        linkTo={opts.linkTo}
      />
    </MemoryRouter>,
  );
}

describe('EventCard (T15 redesign)', () => {
  it('upcoming + workflow + populated description → Upcoming pill + Workflow ✓ pill + body-weight notes + dot-separated meta', () => {
    renderCard(baseEvent, { onDelete: vi.fn() });
    expect(screen.getByTestId('event-card-pill-upcoming')).toBeInTheDocument();
    expect(screen.getByTestId('event-card-pill-workflow')).toBeInTheDocument();
    expect(screen.queryByTestId('event-card-pill-draft')).toBeNull();
    expect(screen.queryByTestId('event-card-pill-past')).toBeNull();
    // Single-line meta: date · dishes · steps. Dot separators present.
    const meta = screen.getByText(/dish/);
    expect(meta.textContent).toContain('1 dish');
    expect(meta.textContent).toContain('1 step');
    expect(meta.textContent).toContain('·');
    // Real description renders in body-weight slate-300.
    expect(screen.getByText('8 guests for a birthday dinner.')).toBeInTheDocument();
  });

  it('past event → Past pill, NOT Upcoming', () => {
    renderCard({ ...baseEvent, serveAt: PAST }, { onDelete: vi.fn() });
    expect(screen.getByTestId('event-card-pill-past')).toBeInTheDocument();
    expect(screen.queryByTestId('event-card-pill-upcoming')).toBeNull();
  });

  it('draft event (no title + no dishes + no serveAt) → Draft pill + "Add a description…" placeholder', () => {
    renderCard({
      ...baseEvent,
      title: '',
      serveAt: undefined,
      dishes: [],
      notes: '',
      workflow: undefined,
    }, { onDelete: vi.fn() });
    expect(screen.getByTestId('event-card-pill-draft')).toBeInTheDocument();
    expect(screen.queryByTestId('event-card-pill-upcoming')).toBeNull();
    expect(screen.queryByTestId('event-card-pill-workflow')).toBeNull();
    // Placeholder copy + italic muted weight.
    expect(screen.getByText(/add a description/i)).toBeInTheDocument();
    // Title falls back to "Untitled event".
    expect(screen.getByRole('link', { name: 'Untitled event' })).toBeInTheDocument();
  });

  it('team-shared event (readOnly OR sharedWithGroupIds set) → Team-shared pill', () => {
    renderCard({ ...baseEvent, readOnly: true }, { onDelete: vi.fn() });
    expect(screen.getByTestId('event-card-pill-shared')).toBeInTheDocument();
  });

  it('omitting onDelete hides the trash button entirely (used by /workflows surface)', () => {
    renderCard(baseEvent);
    expect(screen.queryByRole('button', { name: /delete event/i })).toBeNull();
  });

  it('linkTo override re-targets the primary link (used by WorkflowsLibrary)', () => {
    renderCard(baseEvent, {
      onDelete: vi.fn(),
      linkTo: (e) => `/workflows/${e.id}`,
    });
    const link = screen.getByRole('link', { name: /Demo Event/i });
    expect(link).toHaveAttribute('href', '/workflows/e_test_001');
  });

  it('default link points to /events/:id when no linkTo prop given', () => {
    renderCard(baseEvent, { onDelete: vi.fn() });
    const link = screen.getByRole('link', { name: /Demo Event/i });
    expect(link).toHaveAttribute('href', '/events/e_test_001');
  });
});
