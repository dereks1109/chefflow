import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Edit3, StickyNote, Layers } from 'lucide-react';
import { getEvent } from '../../db/eventsRepo';
import { formatDateTime, formatTimeRange } from '../../core/util/datetime';
import type { KitchenEvent, Session } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; event: KitchenEvent };

export default function EventView() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getEvent(id).then((event) => {
      if (cancelled) return;
      if (!event) setState({ kind: 'not-found' });
      else setState({ kind: 'ready', event });
    });
    return () => { cancelled = true; };
  }, [id]);

  if (state.kind === 'loading') return <div className="p-6 text-slate-500">Loading…</div>;
  if (state.kind === 'not-found') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Event not found.</h1>
        <Link to="/events" className="btn-secondary mt-4 inline-flex">Back to events</Link>
      </div>
    );
  }

  const e = state.event;
  const sortedSessions = e.sessions.slice().sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-2">
        <Link to="/events" className="btn-secondary text-sm inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Events
        </Link>
        <button
          type="button"
          onClick={() => navigate(`/events/${e.id}/edit`)}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
          Edit
        </button>
      </header>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-6 bg-white dark:bg-kitchen-ink">
        <h1 className="text-3xl font-bold">{e.title || 'Untitled event'}</h1>
        <div className="mt-3 flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Calendar className="h-4 w-4" aria-hidden="true" />
          <span>{formatDateTime(e.serveAt)}</span>
        </div>
        {e.notes && (
          <div className="mt-4 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
            <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <p className="whitespace-pre-wrap">{e.notes}</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-2">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          Timeline ({sortedSessions.length} session{sortedSessions.length === 1 ? '' : 's'})
        </h2>
        {sortedSessions.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No sessions added.</p>
        ) : (
          <ol className="space-y-3">
            {sortedSessions.map((s) => <TimelineRow key={s.id} session={s} />)}
          </ol>
        )}
      </div>
    </section>
  );
}

function TimelineRow({ session }: { session: Session }) {
  return (
    <li className="flex gap-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
      <div className="w-32 shrink-0 text-sm text-slate-600 dark:text-slate-400 font-mono">
        {formatTimeRange(session.startAt, session.endAt)}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold">{session.title || 'Untitled session'}</h3>
        {session.notes && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
            {session.notes}
          </p>
        )}
      </div>
    </li>
  );
}
