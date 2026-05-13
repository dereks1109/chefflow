import { Link } from 'react-router-dom';
import { Calendar, Layers, Trash2 } from 'lucide-react';
import type { KitchenEvent } from '../../core/types';
import { formatDateTime } from '../../core/util/datetime';

interface Props {
  event: KitchenEvent;
  onDelete: (e: KitchenEvent) => void;
}

export default function EventCard({ event, onDelete }: Props) {
  const sessionCount = event.sessions.length;
  return (
    <article className="group rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 hover:border-accent transition-colors">
      <header className="flex items-start justify-between gap-3">
        <Link
          to={`/events/${event.id}`}
          className="text-lg font-semibold hover:text-accent flex-1 min-w-0"
        >
          {event.title || 'Untitled event'}
        </Link>
        <button
          type="button"
          onClick={() => onDelete(event)}
          className="touch-target px-2 rounded-md text-slate-400 hover:text-danger opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={`Delete event ${event.title || 'Untitled event'}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      <dl className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{formatDateTime(event.serveAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{sessionCount} session{sessionCount === 1 ? '' : 's'}</span>
        </div>
      </dl>
      {event.notes && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-500 line-clamp-2">
          {event.notes}
        </p>
      )}
    </article>
  );
}
