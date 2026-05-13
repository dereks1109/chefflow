import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Calendar, StickyNote } from 'lucide-react';
import DishForm, { blankDish } from '../components/DishForm';
import DishRow from '../components/DishRow';
import { getEvent, saveEvent } from '../../db/eventsRepo';
import { toLocalInputValue, fromLocalInputValue } from '../../core/util/datetime';
import type { KitchenEvent, Dish } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; event: KitchenEvent };

type DishUiState =
  | { mode: 'none' }
  | { mode: 'adding'; draft: Dish }
  | { mode: 'editing'; index: number; draft: Dish };

export default function EventEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dirty, setDirty] = useState(false);
  const [dishUi, setDishUi] = useState<DishUiState>({ mode: 'none' });

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

  function startAdding() {
    setDishUi({ mode: 'adding', draft: blankDish(e.serveAt) });
  }

  function startEditing(idx: number) {
    setDishUi({ mode: 'editing', index: idx, draft: e.dishes[idx] });
  }

  function confirmDish(next: Dish) {
    if (dishUi.mode === 'adding') {
      update('dishes', [...e.dishes, next]);
    } else if (dishUi.mode === 'editing') {
      const nextList = e.dishes.slice();
      nextList[dishUi.index] = next;
      update('dishes', nextList);
    }
    setDishUi({ mode: 'none' });
  }

  function cancelDish() {
    setDishUi({ mode: 'none' });
  }

  function removeDish(idx: number) {
    update('dishes', e.dishes.filter((_, i) => i !== idx));
  }

  async function handleSave() {
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
            className="btn-primary"
          >
            Save
          </button>
        </div>
      </header>

      <form className="space-y-6" onSubmit={(ev) => ev.preventDefault()}>
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
            <legend className="text-sm font-medium">Dishes</legend>
            {dishUi.mode === 'none' && (
              <button
                type="button"
                onClick={startAdding}
                className="btn-secondary text-sm inline-flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add dish
              </button>
            )}
          </div>

          <ul className="space-y-3">
            {e.dishes.map((d, i) => (
              dishUi.mode === 'editing' && dishUi.index === i ? (
                <li key={d.id}>
                  <DishForm
                    initial={dishUi.draft}
                    eventServeAt={e.serveAt}
                    onConfirm={confirmDish}
                    onCancel={cancelDish}
                  />
                </li>
              ) : (
                <DishRow
                  key={d.id}
                  index={i}
                  value={d}
                  onEdit={() => startEditing(i)}
                  onRemove={() => removeDish(i)}
                />
              )
            ))}
            {dishUi.mode === 'adding' && (
              <li>
                <DishForm
                  initial={dishUi.draft}
                  eventServeAt={e.serveAt}
                  onConfirm={confirmDish}
                  onCancel={cancelDish}
                />
              </li>
            )}
          </ul>

          {e.dishes.length === 0 && dishUi.mode === 'none' && (
            <p className="text-sm text-slate-500 dark:text-slate-500 italic">
              No dishes yet. Add the things you're cooking or bringing to the event.
            </p>
          )}
        </fieldset>
      </form>
    </section>
  );
}
