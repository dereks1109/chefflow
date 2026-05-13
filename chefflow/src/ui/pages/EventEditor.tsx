import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Calendar, StickyNote } from 'lucide-react';
import SessionRow, { blankSession, sessionHasValidRange } from '../components/SessionRow';
import { getEvent, saveEvent } from '../../db/eventsRepo';
import { toLocalInputValue, fromLocalInputValue } from '../../core/util/datetime';
import type { KitchenEvent, Session } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; event: KitchenEvent };

export default function EventEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEvent(id).then((event) => {
      if (cancelled) return;
      if (!event) setState({ kind: 'not-found' });
      else setState({ kind: 'ready', event });
    });
    return () => { cancelled = true; };
  }, [id]);

  const sessionsValid = useMemo(() => {
    if (state.kind !== 'ready') return true;
    return state.event.sessions.every(sessionHasValidRange);
  }, [state]);

  if (state.kind === 'loading') return <div className="p-6 text-slate-500">Loading…</div>;
  if (state.kind === 'not-found') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Event not found.</h1>
        <button type="button" onClick={() => navigate('/events')} className="btn-secondary mt-4">
          Back to events
        </button>
      </div>
    );
  }

  const e = state.event;

  function update<K extends keyof KitchenEvent>(key: K, value: KitchenEvent[K]) {
    setState({ kind: 'ready', event: { ...e, [key]: value } });
    setDirty(true);
  }

  function updateSession(idx: number, next: Session) {
    const nextList = e.sessions.slice();
    nextList[idx] = next;
    update('sessions', nextList);
  }

  function addSession() {
    update('sessions', [...e.sessions, blankSession(e.serveAt)]);
  }

  function removeSession(idx: number) {
    update('sessions', e.sessions.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!sessionsValid) return;
    await saveEvent({ ...e, updatedAt: Date.now() });
    setDirty(false);
    navigate(`/events/${e.id}`);
  }

  function handleCancel() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    navigate(`/events/${e.id}`);
  }

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-6 gap-2">
        <h1 className="text-2xl font-bold">Edit event</h1>
        <div className="flex gap-2">
          <button type="button" onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!sessionsValid}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </header>

      <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        <label className="block">
          <span className="text-sm font-medium">Event title</span>
          <input
            type="text"
            value={e.title}
            onChange={(ev) => update('title', ev.target.value)}
            className="input mt-1"
            placeholder="e.g. Sunday family dinner"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" aria-hidden="true" />
            Date & time
          </span>
          <input
            type="datetime-local"
            value={toLocalInputValue(e.serveAt)}
            onChange={(ev) => update('serveAt', fromLocalInputValue(ev.target.value))}
            className="input mt-1"
            aria-label="Event date and time"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium flex items-center gap-2">
            <StickyNote className="h-4 w-4" aria-hidden="true" />
            Notes
          </span>
          <textarea
            value={e.notes}
            onChange={(ev) => update('notes', ev.target.value)}
            className="input mt-1"
            rows={3}
            placeholder="Description, guests, dietary notes…"
          />
        </label>

        <fieldset>
          <div className="flex items-center justify-between mb-3">
            <legend className="text-sm font-medium">Sessions</legend>
            <button
              type="button"
              onClick={addSession}
              className="btn-secondary text-sm inline-flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add session
            </button>
          </div>
          {e.sessions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-500 italic">
              No sessions yet. Sessions are time-bounded steps within the event (e.g. Prep, Cook, Plate).
            </p>
          ) : (
            <ul className="space-y-3">
              {e.sessions.map((s, i) => (
                <SessionRow
                  key={s.id}
                  index={i}
                  value={s}
                  eventServeAt={e.serveAt}
                  onChange={(next) => updateSession(i, next)}
                  onRemove={() => removeSession(i)}
                />
              ))}
            </ul>
          )}
          {!sessionsValid && (
            <p className="mt-3 text-sm text-danger">
              Fix the invalid session time(s) before saving.
            </p>
          )}
        </fieldset>
      </form>
    </section>
  );
}
