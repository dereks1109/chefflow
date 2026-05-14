import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Calendar, Clock, Compass, Edit3, Hand, Layers, StickyNote, Users } from 'lucide-react';
import { getEvent } from '../../db/eventsRepo';
import { formatDateTime } from '../../core/util/datetime';
import type { Dish, KitchenEvent } from '../../core/types';

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
  const sortedDishes = e.dishes.slice().sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-2">
        <Link to="/events" className="btn-secondary text-sm inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Events
        </Link>
        <div className="flex gap-2">
          <Link
            to={`/workflows/${e.id}`}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <Compass className="h-4 w-4" aria-hidden="true" />
            Workflow
          </Link>
          <button
            type="button"
            onClick={() => navigate(`/events/${e.id}/edit`)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Edit3 className="h-4 w-4" aria-hidden="true" />
            Edit
          </button>
        </div>
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
          Timeline ({sortedDishes.length} dish{sortedDishes.length === 1 ? '' : 'es'})
        </h2>
        {sortedDishes.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No dishes added.</p>
        ) : (
          <ol className="space-y-3">
            {sortedDishes.map((d) => <TimelineRow key={d.id} dish={d} />)}
          </ol>
        )}
      </div>
    </section>
  );
}

function TimelineRow({ dish }: { dish: Dish }) {
  return (
    <li className="flex gap-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
      <div className="w-28 shrink-0 text-sm text-slate-600 dark:text-slate-400 font-mono">
        {formatDateTime(dish.startAt).split(',').slice(-1)[0].trim()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold">{dish.name || 'Untitled dish'}</h3>
          {dish.recipeId && (
            <Link
              to={`/recipes/${dish.recipeId}/edit`}
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <BookOpen className="h-3 w-3" aria-hidden="true" />
              recipe
            </Link>
          )}
          {dish.isPrepared && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Hand className="h-3 w-3" aria-hidden="true" />
              ready
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden="true" />
            {dish.portions} portion{dish.portions === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatDateTime(dish.startAt)}
          </span>
        </div>
        {dish.notes && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
            {dish.notes}
          </p>
        )}
      </div>
    </li>
  );
}
