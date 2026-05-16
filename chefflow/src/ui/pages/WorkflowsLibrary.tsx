import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Compass, Layers } from 'lucide-react';
import { listEvents } from '../../db/eventsRepo';
import { formatDateTime } from '../../core/util/datetime';
import type { KitchenEvent } from '../../core/types';

export default function WorkflowsLibrary() {
  const [events, setEvents] = useState<KitchenEvent[] | null>(null);

  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  if (events === null) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  if (events.length === 0) {
    return (
      <section className="p-6 text-center max-w-md mx-auto">
        <Compass className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold mt-4">Workflows</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Workflows are tied to events. Create an event in the Events tab first, then come back here to plan its kitchen workflow.
        </p>
        <Link to="/events" className="btn-primary mt-6 inline-flex items-center gap-2">
          Go to Events
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  return (
    <section className="p-4 md:p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Workflows</h1>
      </header>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => {
          const dishCount = e.dishes.length;
          return (
            <li key={e.id}>
              <Link
                to={`/workflows/${e.id}`}
                className="group block rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 hover:border-accent transition-colors"
              >
                <h3 className="text-lg font-semibold group-hover:text-accent">
                  {e.title || 'Untitled event'}
                </h3>
                <dl className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{formatDateTime(e.serveAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{dishCount} dish{dishCount === 1 ? '' : 'es'}</span>
                  </div>
                </dl>
                <div className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent">
                  Open workflow
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
