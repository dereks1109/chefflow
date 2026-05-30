import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DroppableProvided,
  type DroppableStateSnapshot,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from '@hello-pangea/dnd';
import { Plus, Calendar, StickyNote, MapPin, Wallet, GripVertical, Trash2, User, Mail, Phone } from 'lucide-react';
import DishForm, { blankDish } from '../components/DishForm';
import DishRow from '../components/DishRow';
import PinGate from '../components/PinGate';
import GroupShareChipRow from '../components/GroupShareChipRow';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { getEvent, saveEvent } from '../../db/eventsRepo';
import { toLocalInputValue, fromLocalInputValue } from '../../core/util/datetime';
import { moveDishToSection, removeDishFromAllSections, UNASSIGNED_LABEL } from '../../core/events/sections';
import { randomId } from '../../core/util/id';
import type { ColorTag, KitchenEvent, Dish, EventSection } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; event: KitchenEvent };

type DishUiState =
  | { mode: 'none' }
  | { mode: 'adding'; draft: Dish; targetSectionId: string | null }
  | { mode: 'editing'; dishId: string; draft: Dish };

// Pseudo droppable id for the synthetic "Unassigned" bucket — null in the
// section helpers, but @hello-pangea/dnd requires a real string id.
const UNASSIGNED_DROPPABLE = '__unassigned__';

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
  const sections = e.sections ?? [];
  const dishById = new Map(e.dishes.map((d) => [d.id, d]));
  const assignedIds = new Set(sections.flatMap((s) => s.dishIds));
  const unassignedDishes = e.dishes.filter((d) => !assignedIds.has(d.id));

  function update<K extends keyof KitchenEvent>(key: K, value: KitchenEvent[K]) {
    setState({ kind: 'ready', event: { ...e, [key]: value } });
    setDirty(true);
  }

  function patch(partial: Partial<KitchenEvent>) {
    setState({ kind: 'ready', event: { ...e, ...partial } });
    setDirty(true);
  }

  function startAddingInSection(targetSectionId: string | null) {
    setDishUi({ mode: 'adding', draft: blankDish(e.serveAt), targetSectionId });
  }

  function startEditingById(dishId: string) {
    const dish = dishById.get(dishId);
    if (!dish) return;
    setDishUi({ mode: 'editing', dishId, draft: dish });
  }

  function confirmDish(next: Dish) {
    if (dishUi.mode === 'adding') {
      const target = dishUi.targetSectionId;
      const nextSections = target === null
        ? sections
        : sections.map((s) =>
            s.id === target ? { ...s, dishIds: [...s.dishIds, next.id] } : s,
          );
      patch({
        dishes: [...e.dishes, next],
        sections: nextSections,
      });
    } else if (dishUi.mode === 'editing') {
      update('dishes', e.dishes.map((d) => (d.id === dishUi.dishId ? next : d)));
    }
    setDishUi({ mode: 'none' });
  }

  function cancelDish() {
    setDishUi({ mode: 'none' });
  }

  function removeDishById(dishId: string) {
    patch({
      dishes: e.dishes.filter((d) => d.id !== dishId),
      sections: removeDishFromAllSections(sections, dishId),
    });
  }

  function setDishColorById(dishId: string, colorTag: ColorTag | undefined) {
    update('dishes', e.dishes.map((d) => (d.id === dishId ? { ...d, colorTag } : d)));
  }

  function setDishStartAtById(dishId: string, startAt: string) {
    update('dishes', e.dishes.map((d) => (d.id === dishId ? { ...d, startAt } : d)));
  }

  function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const destSectionId =
      destination.droppableId === UNASSIGNED_DROPPABLE ? null : destination.droppableId;
    update(
      'sections',
      moveDishToSection(sections, draggableId, destSectionId, destination.index),
    );
  }

  function addSection() {
    const next: EventSection = {
      id: `sec_${randomId()}`,
      name: `Section ${sections.length + 1}`,
      dishIds: [],
    };
    update('sections', [...sections, next]);
  }

  function renameSection(sectionId: string, name: string) {
    update(
      'sections',
      sections.map((s) => (s.id === sectionId ? { ...s, name } : s)),
    );
  }

  function removeSection(sectionId: string) {
    const target = sections.find((s) => s.id === sectionId);
    if (!target) return;
    const label = target.name.trim() || 'this section';
    const msg = target.dishIds.length
      ? `Remove "${label}"? Its ${target.dishIds.length} dish${target.dishIds.length === 1 ? '' : 'es'} will move back to Unassigned.`
      : `Remove "${label}"?`;
    if (!window.confirm(msg)) return;
    update('sections', sections.filter((s) => s.id !== sectionId));
  }

  async function handleSave() {
    if (!window.confirm('Save changes to this event?')) return;
    await saveEvent({ ...e, updatedAt: Date.now() });
    setDirty(false);
    navigate(`/events/${e.id}`);
  }

  function handleCancel() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    navigate(`/events/${e.id}`);
  }

  return (
    <PinGate>
    <section className="p-4 md:p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-6 gap-2">
        <h1 className="text-2xl font-bold">Edit event</h1>
        <div className="flex gap-2">
          <button type="button" onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} className="btn-primary">
            Save
          </button>
        </div>
      </header>

      <form className="space-y-6" onSubmit={(ev) => ev.preventDefault()}>
        {/* T4 Phase 3 — per-item team-share chips for this event. Self-
            hides for non-Enterprise tiers (no team to share with). */}
        <GroupShareChipRow
          selectedGroupIds={e.sharedWithGroupIds}
          onChange={(next) => update('sharedWithGroupIds', next)}
        />
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

        <div>
          <span className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Location
          </span>
          <div className="mt-1">
            <LocationAutocomplete
              value={e.location ?? ''}
              onChange={(v) => update('location', v)}
              placeholder="Start typing an address — Google Places suggestions appear inline"
              ariaLabel="Event location"
            />
          </div>
        </div>

        <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <legend className="sr-only">Contact</legend>
          <label className="block">
            <span className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" aria-hidden="true" />
              Contact name
            </span>
            <input
              type="text"
              value={e.contactName ?? ''}
              onChange={(ev) => update('contactName', ev.target.value || undefined)}
              className="input mt-1"
              aria-label="Contact name"
              placeholder="e.g. Alex Johnson"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" aria-hidden="true" />
              Email
            </span>
            <input
              type="email"
              value={e.contactEmail ?? ''}
              onChange={(ev) => update('contactEmail', ev.target.value || undefined)}
              className="input mt-1"
              aria-label="Contact email"
              placeholder="alex@example.com"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4" aria-hidden="true" />
              Phone
            </span>
            <input
              type="tel"
              value={e.contactPhone ?? ''}
              onChange={(ev) => update('contactPhone', ev.target.value || undefined)}
              className="input mt-1"
              aria-label="Contact phone"
              placeholder="+44 7700 900123"
            />
          </label>
        </fieldset>

        <label className="block">
          <span className="text-sm font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4" aria-hidden="true" />
            Budget (£) — optional
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={e.budget ?? ''}
            onChange={(ev) => {
              const raw = ev.target.value;
              if (raw === '') return update('budget', undefined);
              const n = Number(raw);
              if (Number.isFinite(n) && n >= 0) update('budget', n);
            }}
            placeholder="—"
            className="input mt-1"
            aria-label="Event budget in GBP"
          />
          <span className="block mt-1 text-xs text-slate-500">
            Compared against the total of priced dishes during the menu suitability check.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium flex items-center gap-2">
            <StickyNote className="h-4 w-4" aria-hidden="true" />
            Notes / dietary requirements
          </span>
          <textarea
            value={e.notes}
            onChange={(ev) => update('notes', ev.target.value)}
            className="input mt-1"
            rows={4}
            placeholder="e.g. 3 vegans, 1 peanut allergy, 2 gluten-free · plus any other notes for this event"
          />
          <span className="block mt-1 text-xs text-slate-500">
            The dietary signal here drives the menu suitability check on the event page.
          </span>
        </label>

        <fieldset>
          <div className="flex items-center justify-between mb-3">
            <legend className="text-sm font-medium">Dishes & sections</legend>
            <button
              type="button"
              onClick={addSection}
              className="btn-secondary text-sm inline-flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add section
            </button>
          </div>

          <p className="text-xs text-slate-500 mb-2">
            Drag dishes between sections, or use each section's <em>Add dish</em> button.
          </p>

          <DragDropContext onDragEnd={handleDragEnd}>
            <div>
              {/* Unassigned bucket — always present so it can accept drops, but hidden when empty. */}
              <SectionContainer
                droppableId={UNASSIGNED_DROPPABLE}
                title={UNASSIGNED_LABEL}
                hideWhenEmpty={
                  unassignedDishes.length === 0
                  && sections.length > 0
                  && !(dishUi.mode === 'adding' && dishUi.targetSectionId === null)
                }
                addDishForm={
                  dishUi.mode === 'adding' && dishUi.targetSectionId === null ? (
                    <DishForm
                      initial={dishUi.draft}
                      eventServeAt={e.serveAt}
                      onConfirm={confirmDish}
                      onCancel={cancelDish}
                    />
                  ) : undefined
                }
                onAddDish={dishUi.mode === 'none' ? () => startAddingInSection(null) : undefined}
              >
                {unassignedDishes.map((d, i) => (
                  <DraggableDish
                    key={d.id}
                    dish={d}
                    index={i}
                    isEditing={dishUi.mode === 'editing' && dishUi.dishId === d.id}
                    editingDraft={dishUi.mode === 'editing' && dishUi.dishId === d.id ? dishUi.draft : undefined}
                    eventServeAt={e.serveAt}
                    onStartEdit={() => startEditingById(d.id)}
                    onRemove={() => removeDishById(d.id)}
                    onColorChange={(c) => setDishColorById(d.id, c)}
                    onTimeChange={(iso) => setDishStartAtById(d.id, iso)}
                    onConfirm={confirmDish}
                    onCancel={cancelDish}
                  />
                ))}
              </SectionContainer>

              {sections.map((section) => {
                const dishesInSection = section.dishIds
                  .map((id) => dishById.get(id))
                  .filter((d): d is Dish => Boolean(d));
                const isAddingHere = dishUi.mode === 'adding' && dishUi.targetSectionId === section.id;
                return (
                  <SectionContainer
                    key={section.id}
                    droppableId={section.id}
                    title={section.name}
                    onRename={(name) => renameSection(section.id, name)}
                    onRemove={() => removeSection(section.id)}
                    onAddDish={dishUi.mode === 'none' ? () => startAddingInSection(section.id) : undefined}
                    addDishForm={
                      isAddingHere ? (
                        <DishForm
                          initial={dishUi.draft}
                          eventServeAt={e.serveAt}
                          onConfirm={confirmDish}
                          onCancel={cancelDish}
                        />
                      ) : undefined
                    }
                  >
                    {dishesInSection.map((d, i) => (
                      <DraggableDish
                        key={d.id}
                        dish={d}
                        index={i}
                        isEditing={dishUi.mode === 'editing' && dishUi.dishId === d.id}
                        editingDraft={dishUi.mode === 'editing' && dishUi.dishId === d.id ? dishUi.draft : undefined}
                        eventServeAt={e.serveAt}
                        onStartEdit={() => startEditingById(d.id)}
                        onRemove={() => removeDishById(d.id)}
                        onColorChange={(c) => setDishColorById(d.id, c)}
                        onTimeChange={(iso) => setDishStartAtById(d.id, iso)}
                        onConfirm={confirmDish}
                        onCancel={cancelDish}
                      />
                    ))}
                  </SectionContainer>
                );
              })}
            </div>
          </DragDropContext>

          {e.dishes.length === 0 && sections.length === 0 && dishUi.mode === 'none' && (
            <p className="text-sm text-slate-500 dark:text-slate-500 italic mt-2">
              No dishes or sections yet. Click "Add section" to start, then add dishes to the section.
            </p>
          )}
        </fieldset>
      </form>
    </section>
    </PinGate>
  );
}

// ---------------------------------------------------------------------------
// SectionContainer — a droppable bucket with an editable title, an optional
// remove button, and an inline "Add dish" affordance that targets THIS
// section. The unassigned bucket passes no rename/remove (it's synthetic) but
// still gets an Add-dish button.
//
// Visually: no box — sections are separated by a thin top border so the page
// reads as a continuous list. Dragging over highlights only the drop area.
// ---------------------------------------------------------------------------
interface SectionContainerProps {
  droppableId: string;
  title: string;
  hideWhenEmpty?: boolean;
  onRename?: (name: string) => void;
  onRemove?: () => void;
  onAddDish?: () => void;
  /** When set, replaces the "Add dish" button with the inline DishForm. */
  addDishForm?: React.ReactNode;
  children: React.ReactNode;
}

function SectionContainer({
  droppableId,
  title,
  hideWhenEmpty,
  onRename,
  onRemove,
  onAddDish,
  addDishForm,
  children,
}: SectionContainerProps) {
  return (
    <Droppable droppableId={droppableId}>
      {(dropProvided: DroppableProvided, dropSnapshot: DroppableStateSnapshot) => {
        const childCount = Array.isArray(children) ? children.length : children ? 1 : 0;
        const isEmpty = childCount === 0;
        if (hideWhenEmpty && isEmpty && !dropSnapshot.isDraggingOver && !addDishForm) {
          // Keep dnd aware of this droppable but invisible to the user.
          return (
            <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="hidden">
              {dropProvided.placeholder}
            </div>
          );
        }
        return (
          <section className="border-t border-slate-200 dark:border-slate-700 pt-4 pb-2 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2 mb-2">
              {onRename ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => onRename(e.target.value)}
                  className="flex-1 bg-transparent text-sm font-semibold uppercase tracking-wide
                             text-slate-700 dark:text-slate-200 border-0 border-b border-transparent
                             hover:border-slate-300 focus:border-accent focus:outline-none
                             px-1 py-0.5"
                  aria-label="Section name"
                  placeholder="Section name"
                />
              ) : (
                <span className="flex-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {title}
                </span>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label={`Remove section "${title}"`}
                  className="touch-target text-slate-400 hover:text-red-600 px-2 rounded"
                  title="Remove section"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className={[
                'space-y-3 min-h-[2.5rem] rounded transition-colors',
                dropSnapshot.isDraggingOver ? 'bg-accent/5' : '',
              ].join(' ')}
            >
              {children}
              {dropProvided.placeholder}
            </div>
            {addDishForm ? (
              <div className="mt-3">{addDishForm}</div>
            ) : (
              onAddDish && (
                <button
                  type="button"
                  onClick={onAddDish}
                  className="btn-secondary text-xs inline-flex items-center gap-1 mt-2"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  Add dish
                </button>
              )
            )}
          </section>
        );
      }}
    </Droppable>
  );
}

// ---------------------------------------------------------------------------
// DraggableDish — wraps DishRow in a Draggable with a separate grip handle so
// the existing per-dish controls (edit / remove / color) still work. Also
// swaps to DishForm when editing this row.
// ---------------------------------------------------------------------------
interface DraggableDishProps {
  dish: Dish;
  index: number;
  isEditing: boolean;
  editingDraft?: Dish;
  eventServeAt?: string;
  onStartEdit: () => void;
  onRemove: () => void;
  onColorChange: (c: ColorTag | undefined) => void;
  onTimeChange: (nextIsoStartAt: string) => void;
  onConfirm: (next: Dish) => void;
  onCancel: () => void;
}

function DraggableDish({
  dish,
  index,
  isEditing,
  editingDraft,
  eventServeAt,
  onStartEdit,
  onRemove,
  onColorChange,
  onTimeChange,
  onConfirm,
  onCancel,
}: DraggableDishProps) {
  return (
    <Draggable draggableId={dish.id} index={index} isDragDisabled={isEditing}>
      {(dragProvided: DraggableProvided, dragSnapshot: DraggableStateSnapshot) => (
        <div
          ref={dragProvided.innerRef}
          {...dragProvided.draggableProps}
          className={dragSnapshot.isDragging ? 'opacity-90' : ''}
        >
          {isEditing && editingDraft ? (
            <DishForm
              initial={editingDraft}
              eventServeAt={eventServeAt}
              onConfirm={onConfirm}
              onCancel={onCancel}
            />
          ) : (
            <div className="flex items-start gap-2">
              <span
                {...dragProvided.dragHandleProps}
                className="touch-target text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 pt-2 cursor-grab"
                aria-label="Drag dish"
                title="Drag to another section"
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <DishRow
                  index={0}
                  value={dish}
                  reorderMode={false}
                  canMoveUp={false}
                  canMoveDown={false}
                  onEdit={onStartEdit}
                  onRemove={onRemove}
                  onColorChange={onColorChange}
                  onTimeChange={onTimeChange}
                  onMoveUp={() => undefined}
                  onMoveDown={() => undefined}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
