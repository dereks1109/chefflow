import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, StickyNote } from 'lucide-react';
import NestedDragDropBuilder, { type DndMilestone } from '../components/NestedDragDropBuilder';
import { getEvent } from '../../db/eventsRepo';
import { formatDateTime } from '../../core/util/datetime';
import type { KitchenEvent } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; event: KitchenEvent };

// Placeholder workflow data for the Demo Event. This is hand-crafted to
// mirror the reverse-engineered timeline I sketched in chat for the Demo
// Event (Ribeye + Salad, serve at 18:00). When the scheduler algorithm
// ships, this is replaced by scheduleEvent(event, recipes).
const DEMO_EVENT_PLACEHOLDER: DndMilestone[] = [
  {
    id: 'm-prep',
    title: 'Phase 1 — Cold prep (17:30 – 17:40)',
    steps: [
      { id: 's-prep-1', content: 'Wash & dry salad leaves' },
      { id: 's-prep-2', content: 'Halve cherry tomatoes' },
      { id: 's-prep-3', content: 'Slice cucumber into half-moons' },
      { id: 's-prep-4', content: 'Whisk dressing (oil, lemon, salt, pepper)' },
    ],
  },
  {
    id: 'm-sanitize',
    title: 'Phase 1.5 — Sanitize handoff (17:40 – 17:43)',
    steps: [
      { id: 's-san-1', content: 'Hold leaves at room temp; refrigerate tomatoes & cucumber' },
      { id: 's-san-2', content: 'Wash green board & knife; switch to red board for beef' },
    ],
  },
  {
    id: 'm-mise',
    title: 'Phase 2 — Beef mise en place (17:43 – 17:48)',
    steps: [
      { id: 's-mise-1', content: 'Pat steaks dry, season generously with salt & pepper' },
      { id: 's-mise-2', content: 'Smash garlic clove, pluck thyme leaves' },
      { id: 's-mise-3', content: 'Pre-portion butter on a small dish' },
    ],
  },
  {
    id: 'm-cook',
    title: 'Phase 3 — Sear & baste (17:48 – 17:55)',
    steps: [
      { id: 's-cook-1', content: 'Skillet on high until smoking (~2 min)' },
      { id: 's-cook-2', content: 'Sear steaks 2 min, side 1 (don\'t move)' },
      { id: 's-cook-3', content: 'Flip; sear 2 min, side 2' },
      { id: 's-cook-4', content: 'Reduce heat; add butter, garlic, thyme; baste 1 min' },
      { id: 's-cook-5', content: 'Remove steaks; rest under foil 5 min' },
    ],
  },
  {
    id: 'm-plate',
    title: 'Phase 4 — Final toss & plate (17:55 – 18:00)',
    steps: [
      { id: 's-plate-1', content: 'Plate salad leaves, tomatoes, cucumber' },
      { id: 's-plate-2', content: 'Re-whisk dressing; drizzle over plated salads' },
      { id: 's-plate-3', content: 'Slice rested steaks against the grain' },
      { id: 's-plate-4', content: 'Lay slices alongside salad; spoon pan butter over' },
      { id: 's-plate-5', content: 'Serve at 18:00' },
    ],
  },
];

function initialMilestonesFor(event: KitchenEvent): DndMilestone[] {
  if (event.id === 'e_demo_main') return DEMO_EVENT_PLACEHOLDER;
  return [];
}

export default function Workflow() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getEvent(eventId).then((event) => {
      if (cancelled) return;
      if (!event) setState({ kind: 'not-found' });
      else setState({ kind: 'ready', event });
    });
    return () => { cancelled = true; };
  }, [eventId]);

  if (state.kind === 'loading') return <div className="p-6 text-slate-500">Loading…</div>;
  if (state.kind === 'not-found') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Event not found.</h1>
        <Link to="/workflows" className="btn-secondary mt-4 inline-flex">
          Back to workflows
        </Link>
      </div>
    );
  }

  const event = state.event;
  const initial = initialMilestonesFor(event);

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <Link to="/workflows" className="btn-secondary text-sm inline-flex items-center gap-1 w-fit">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Workflows
      </Link>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-6 bg-white dark:bg-kitchen-ink">
        <h1 className="text-3xl font-bold">{event.title || 'Untitled event'}</h1>
        <div className="mt-3 flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Calendar className="h-4 w-4" aria-hidden="true" />
          <span>{formatDateTime(event.serveAt)}</span>
        </div>
        {event.notes && (
          <div className="mt-4 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
            <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <p className="whitespace-pre-wrap">{event.notes}</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Workflow
        </h2>
        {initial.length === 0 && (
          <p className="text-sm text-slate-500 italic mb-3">
            No workflow steps yet — add milestones below. The algorithm will fill this in automatically once it ships.
          </p>
        )}
        {/* Pass eventId as the key so swapping between events fully resets the
            DnD state (the builder takes initialMilestones only once at mount). */}
        <NestedDragDropBuilder key={event.id} initialMilestones={initial} />
      </div>
    </section>
  );
}
