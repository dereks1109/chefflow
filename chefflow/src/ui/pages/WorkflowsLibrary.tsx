import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Compass } from 'lucide-react';
import { listEvents } from '../../db/eventsRepo';
import EventCard from '../components/EventCard';
import type { KitchenEvent } from '../../core/types';

// T15 — Workflows library uses the same EventCard the /events library
// does, with linkTo overridden to `/workflows/:id` so a tap takes the
// chef to the per-event workflow page. Trash button hides on this
// surface (onDelete omitted) — deleting an event from a workflows
// listing isn't a supported action; the chef does that from /events.

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
      {/* min-h-touch keeps the header at the same 48px floor as every
          other library's <header> (which inherits that floor implicitly
          from btn-primary's .touch-target on its action button). Without
          it the WorkflowsLibrary h1 sits ~6px higher than the matching
          h1 on /events / /recipes / /teams because the header collapses
          to the h1's natural line-height with no button to set the floor. */}
      <header className="flex items-center justify-between mb-6 min-h-touch">
        <h1 className="text-2xl font-bold">Workflows</h1>
      </header>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => (
          <li key={e.id} className="flex flex-col relative">
            <EventCard event={e} linkTo={(ev) => `/workflows/${ev.id}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
