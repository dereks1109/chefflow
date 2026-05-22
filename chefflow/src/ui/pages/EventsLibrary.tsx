import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Plus, Sparkles } from 'lucide-react';
import EventCard from '../components/EventCard';
import GenerateEventSheet, { type ResumeReview } from '../components/GenerateEventSheet';
import { listEvents, saveEvent, deleteEvent } from '../../db/eventsRepo';
import { listRecipes } from '../../db/recipesRepo';
import { loadReviewDraft } from '../../core/events/reviewDraft';
import { consumeDailyQuota, QuotaExceededError } from '../../core/tier/quotaClient';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { useAuthGate } from '../../state/useAuthGate';
import type { KitchenEvent } from '../../core/types';

export default function EventsLibrary() {
  const requireAuth = useAuthGate();
  const [events, setEvents] = useState<KitchenEvent[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Populated when the chef returns from the recipe editor mid-review.
  // Passed through to GenerateEventSheet so it can rebuild the review screen
  // with the saved event + match map + the freshly-saved stub recipe linked.
  const [resumeReview, setResumeReview] = useState<ResumeReview | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    listEvents().then(setEvents);
  }, []);

  // Pick up any pending review draft once on mount.
  useEffect(() => {
    const draft = loadReviewDraft();
    if (!draft) return;
    let cancelled = false;
    void listRecipes().then((recipes) => {
      if (cancelled) return;
      setResumeReview({ draft, recipes });
      setSheetOpen(true);
    });
    return () => { cancelled = true; };
  }, []);

  function handleSheetClose() {
    setSheetOpen(false);
    setResumeReview(undefined);
  }

  async function handleCreated(fresh: KitchenEvent) {
    try {
      await consumeDailyQuota({ kind: 'event' });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        useUpgradeSheetStore.getState().openWith('event');
        return;
      }
      throw err;
    }
    await saveEvent(fresh);
    setSheetOpen(false);
    setResumeReview(undefined);
    navigate(`/events/${fresh.id}/edit`);
  }

  async function handleDelete(target: KitchenEvent) {
    if (target.id.startsWith('e_demo_')) return;
    if (!window.confirm(`Delete "${target.title}"? This cannot be undone.`)) return;
    await deleteEvent(target.id);
    setEvents(await listEvents());
  }

  if (events === null) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  if (events.length === 0) {
    return (
      <>
        <section className="p-6 text-center max-w-md mx-auto">
          <CalendarPlus className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <h1 className="text-2xl font-bold mt-4">Events</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            No events yet. Plan a dinner, a service, or a meal prep day.
          </p>
          <button
            type="button"
            onClick={() => requireAuth(() => setSheetOpen(true))}
            className="btn-primary mt-6 inline-flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Create your first event
          </button>
        </section>
        <GenerateEventSheet
          open={sheetOpen}
          onClose={handleSheetClose}
          onCreated={(ev) => void handleCreated(ev)}
          initialReview={resumeReview}
        />
      </>
    );
  }

  return (
    <section className="p-4 md:p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <button
          type="button"
          onClick={() => requireAuth(() => setSheetOpen(true))}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New event
        </button>
      </header>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => (
          <li key={e.id} className="h-full">
            <EventCard event={e} onDelete={handleDelete} />
          </li>
        ))}
      </ul>
      <GenerateEventSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={(ev) => void handleCreated(ev)}
      />
    </section>
  );
}
