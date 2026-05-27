import {
  AlertTriangle,
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
import { findAllergyKeywords } from '../../core/events/allergyKeywords';
import { useAllergyKeywordsStore } from '../../state/useAllergyKeywordsStore';
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
            <AllergyKeywordBanner notes={event.notes} notesOriginal={event.notesOriginal} />
            <NotesList notes={event.notes} notesOriginal={event.notesOriginal} />
          </div>
        </div>
      )}
    </div>
  );
}

// Banner above the notes block that surfaces the count of allergy /
// intolerance keywords found in the customer's text. Scans `notesOriginal`
// when present (real source), else the parsed `notes` (manual-entry events).
// Hidden when no matches are found. The matched words themselves are
// highlighted inside the NotesList hover popover.
function AllergyKeywordBanner({ notes, notesOriginal }: { notes: string; notesOriginal?: string }) {
  const extras = useAllergyKeywordsStore((s) => s.extras);
  const haystack = notesOriginal && notesOriginal.trim().length > 0 ? notesOriginal : notes;
  const matches = findAllergyKeywords(haystack, extras);
  if (matches.length === 0) return null;
  return (
    <div
      role="note"
      data-testid="event-detail-allergy-banner"
      className="mb-2 flex items-start gap-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-900 dark:text-red-200"
    >
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <strong>{matches.length}</strong> allergy / intolerance keyword
        {matches.length === 1 ? '' : 's'} found in the {notesOriginal ? 'customer email' : 'notes'}.
        Hover the notes below to see them highlighted, and please read the
        original text carefully.
      </span>
    </div>
  );
}
