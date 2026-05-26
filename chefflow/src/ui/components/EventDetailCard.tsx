import {
  Calendar,
  Edit3,
  ExternalLink,
  MapPin,
  StickyNote,
  Users,
  Wallet,
} from 'lucide-react';
import EventContactRow from './EventContactRow';
import NotesList from './NotesList';
import { formatDateTime } from '../../core/util/datetime';
import { formatGBP } from '../../core/util/money';
import type { KitchenEvent } from '../../core/types';

interface Props {
  event: KitchenEvent;
  /** When supplied, an edit pencil renders in the top-right and calls
   *  this callback on click. Omit to render the card read-only — that's
   *  how the Workflow page uses it. */
  onEdit?: () => void;
}

// Single source of truth for the event-detail card. Used by both
// EventView (with edit affordance) and the Workflow page (read-only).
// Renders title, serveAt, location (Maps link), contact row, guest count,
// budget, and notes via NotesList. Any new field belongs here — not
// inlined into the consumers — so the two surfaces stay in sync.

export default function EventDetailCard({ event, onEdit }: Props) {
  return (
    <div
      data-testid="event-detail-card"
      className="relative rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink text-sm"
    >
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit event details"
          data-testid="event-detail-card-edit"
          className="absolute top-3 right-3 p-1.5 rounded text-slate-400 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          title="Edit event details"
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <h1
        className={onEdit ? 'text-2xl font-bold pr-8' : 'text-2xl font-bold'}
        data-testid="event-detail-card-title"
      >
        {event.title || 'Untitled event'}
      </h1>
      <div className="mt-2 flex items-center gap-2 text-slate-600 dark:text-slate-400">
        <Calendar className="h-4 w-4" aria-hidden="true" />
        <span>{formatDateTime(event.serveAt)}</span>
      </div>
      {event.location && (
        <div className="mt-2 flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-accent hover:underline"
            title="Open in Google Maps"
          >
            {event.location}
            <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
          </a>
        </div>
      )}
      <EventContactRow name={event.contactName} email={event.contactEmail} phone={event.contactPhone} />
      {event.numberOfGuests !== undefined && (
        <div className="mt-2 flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>
            {event.numberOfGuests} guest{event.numberOfGuests === 1 ? '' : 's'}
          </span>
        </div>
      )}
      {event.budget !== undefined && (
        <div className="mt-2 flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Wallet className="h-4 w-4" aria-hidden="true" />
          <span>Budget {formatGBP(event.budget)}</span>
        </div>
      )}
      {event.notes && (
        <div className="mt-2 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
          <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <NotesList notes={event.notes} notesOriginal={event.notesOriginal} />
          </div>
        </div>
      )}
    </div>
  );
}
