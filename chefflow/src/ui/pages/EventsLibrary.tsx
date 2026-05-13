import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, CalendarPlus } from 'lucide-react';
import EventCard from '../components/EventCard';
import { listEvents, saveEvent, deleteEvent } from '../../db/eventsRepo';
import { randomId } from '../../core/util/id';
import type { KitchenEvent } from '../../core/types';

export default function EventsLibrary() {
  const [events, setEvents] = useState<KitchenEvent[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  async function handleCreateNew() {
    const fresh: KitchenEvent = {
      id: randomId(),
      title: 'Untitled event',
      serveAt: undefined,
      notes: '',
      dishes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveEvent(fresh);
    navigate(`/events/${fresh.id}/edit`);
  }

  async function handleDelete(target: KitchenEvent) {
    if (!window.confirm(`Delete "${target.title}"? This cannot be undone.`)) return;
    await deleteEvent(target.id);
    setEvents(await listEvents());
  }

  if (events === null) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  if (events.length === 0) {
    return (
      <section className="p-6 text-center max-w-md mx-auto">
        <CalendarPlus className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold mt-4">Events</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          No events yet. Plan a dinner, a service, or a meal prep day.
        </p>
        <Link
          to="#"
          onClick={(e) => {
            e.preventDefault();
            void handleCreateNew();
          }}
          className="btn-primary mt-6 inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create your first event
        </Link>
      </section>
    );
  }

  return (
    <section className="p-4 md:p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <button
          type="button"
          onClick={() => void handleCreateNew()}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New event
        </button>
      </header>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => (
          <li key={e.id}>
            <EventCard event={e} onDelete={handleDelete} />
          </li>
        ))}
      </ul>
    </section>
  );
}
