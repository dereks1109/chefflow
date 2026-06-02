import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { KitchenEvent } from '../../core/types';
import { formatDateTime } from '../../core/util/datetime';

interface Props {
  event: KitchenEvent;
  /** Tap handler for the trash button. When omitted (e.g. on /workflows
   *  where deleting an event from a workflow listing doesn't make sense)
   *  the trash button hides entirely. */
  onDelete?: (e: KitchenEvent) => void;
  /** Override the card's primary link. Defaults to /events/:id. The
   *  WorkflowsLibrary surface passes (e) => `/workflows/${e.id}` so a
   *  tap takes the chef to the per-event workflow page. */
  linkTo?: (e: KitchenEvent) => string;
}

function isDemo(event: KitchenEvent): boolean {
  return event.id.startsWith('e_demo_');
}

// State-pill toning. Tailwind purges classes statically — keep the
// full class strings inline so each one survives the build.
const TONES = {
  slate: 'bg-slate-500/15 text-slate-400',
  emerald: 'bg-emerald-500/15 text-emerald-300',
  accent: 'bg-accent/15 text-accent',
  amber: 'bg-amber-500/15 text-amber-300',
} as const;

function Pill({ tone, children, testId }: {
  tone: keyof typeof TONES;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export default function EventCard({ event, onDelete, linkTo }: Props) {
  const dishCount = event.dishes.length;
  // State derivation — pure from event data, no new component state.
  const now = Date.now();
  const serveAtMs = event.serveAt ? new Date(event.serveAt).getTime() : null;
  const isPast = serveAtMs !== null && serveAtMs < now;
  const isUpcoming = serveAtMs !== null && serveAtMs >= now;
  const isDraft = !event.title && dishCount === 0 && serveAtMs === null;
  const hasWorkflow = (event.workflow?.length ?? 0) > 0;
  const isShared = event.readOnly === true ||
    (Array.isArray(event.sharedWithGroupIds) && event.sharedWithGroupIds.length > 0);

  const href = linkTo ? linkTo(event) : `/events/${event.id}`;
  const showTrash = !!onDelete && !isDemo(event);

  return (
    <article className="flex flex-1 flex-col group rounded-xl ring-1 ring-white/5 bg-surface-2/40 hover:bg-surface-2/70 hover:ring-accent/40 p-4 transition-colors">
      {/* State pill row — at-a-glance scan of what's in the card without
          opening it. Pills are pure-render derivations from event data
          (no extra state, no async). */}
      <div className="flex flex-wrap items-center gap-1 mb-2">
        {isDraft && <Pill tone="slate" testId="event-card-pill-draft">Draft</Pill>}
        {isUpcoming && <Pill tone="emerald" testId="event-card-pill-upcoming">Upcoming</Pill>}
        {isPast && <Pill tone="slate" testId="event-card-pill-past">Past</Pill>}
        {hasWorkflow && <Pill tone="accent" testId="event-card-pill-workflow">Workflow ✓</Pill>}
        {isShared && <Pill tone="amber" testId="event-card-pill-shared">Team-shared</Pill>}
      </div>

      <header className="flex items-start justify-between gap-3">
        <Link
          to={href}
          className="text-base font-semibold hover:text-accent flex-1 min-w-0 line-clamp-2 leading-snug"
        >
          {event.title || 'Untitled event'}
        </Link>
        {showTrash && (
          <button
            type="button"
            onClick={() => onDelete!(event)}
            // T15 — opacity-60 (was 0) so touch-only chefs can see the
            // action without hover; bumps to 100% on hover for emphasis.
            className="h-7 w-7 rounded-md text-slate-500 hover:text-danger hover:bg-danger/10 inline-flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity"
            aria-label={`Delete event ${event.title || 'Untitled event'}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </header>

      {/* Single-line meta — replaces 3 icon-rows. Dot-separated so
          missing fields (no serveAt, no workflow) just drop from the
          line without leaving icon-only gaps. */}
      <p className="mt-1 text-xs text-slate-400">
        {event.serveAt ? formatDateTime(event.serveAt) : 'No date'}
        {' · '}
        {dishCount} dish{dishCount === 1 ? '' : 'es'}
        {hasWorkflow && ` · ${event.workflow!.length} step${event.workflow!.length === 1 ? '' : 's'}`}
      </p>

      {/* Description / placeholder. mt-auto pins to the card's bottom
          (T9 equal-height behaviour preserved). Real notes get body
          weight (text-slate-300); empty gets italic-muted "Add a
          description…" hint instead of the post-T12 "No description"
          which read as filler. */}
      <p className="mt-auto pt-3 text-sm line-clamp-3">
        {event.notes
          ? <span className="text-slate-300">{event.notes}</span>
          : <span className="italic text-slate-500">Add a description…</span>}
      </p>
    </article>
  );
}
