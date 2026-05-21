import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DroppableProvided,
  type DraggableProvided,
} from '@hello-pangea/dnd';
import { randomId } from '../../core/util/id';
import { ArrowLeft, Calendar, Edit3, ExternalLink, GripVertical, Layers, Mail, MapPin, Phone, Plus, Sparkles, StickyNote, Trash2, User, Users, Wallet } from 'lucide-react';
import { getEvent, saveEvent } from '../../db/eventsRepo';
import { listRecipes, saveRecipe } from '../../db/recipesRepo';
import DishForm, { blankDish } from '../components/DishForm';
import DishRow from '../components/DishRow';
import EventDetailsSheet from '../components/EventDetailsSheet';
import NotesList from '../components/NotesList';
import MenuCheckPanel from '../components/MenuCheckPanel';
import { formatDateTime } from '../../core/util/datetime';
import { formatGBP } from '../../core/util/money';
import { groupDishesBySections, moveDishToSection, removeDishFromAllSections } from '../../core/events/sections';
import type { ColorTag, Dish, EventSection, KitchenEvent, MenuAnalysis, Recipe } from '../../core/types';

// Synthetic id for the Unassigned bucket — dnd needs a non-null string,
// but `moveDishToSection` treats null as "clear section assignment".
const UNASSIGNED_DROPPABLE = '__unassigned__';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; event: KitchenEvent };

type AddDishUi = { open: false } | { open: true; draft: Dish };

export default function EventView() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Full recipe library — loaded once per mount. Used three ways:
  //   1) `recipesById` (derived Map) prices dishes for the per-dish line +
  //      event-total summary.
  //   2) `recipeMatches` autocomplete in DishRow's inline name editor.
  //   3) Local writes via `setRecipePricePerPortion` patch the same array
  //      in place so the affected row re-renders without a refetch.
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const recipesById = useMemo(
    () => new Map(allRecipes.map((r) => [r.id, r])),
    [allRecipes],
  );
  const [addDishUi, setAddDishUi] = useState<AddDishUi>({ open: false });
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEvent(id).then((event) => {
      if (cancelled) return;
      if (!event) setState({ kind: 'not-found' });
      else setState({ kind: 'ready', event });
    });
    return () => { cancelled = true; };
  }, [id]);

  // Load the full recipe library once on mount so the autocomplete dropdown
  // can search across all titles, not just those already linked to a dish.
  // Per-dish lookups go through the derived `recipesById` Map (above).
  useEffect(() => {
    let cancelled = false;
    void listRecipes().then((all) => {
      if (cancelled) return;
      setAllRecipes(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const dishGroups = groupDishesBySections(e.dishes, e.sections);

  function dishPrice(dish: Dish): number | undefined {
    if (!dish.recipeId) return undefined;
    const recipe = recipesById.get(dish.recipeId);
    const perPortion = recipe?.pricePerPortion;
    if (perPortion === undefined) return undefined;
    return perPortion * dish.portions;
  }

  const eventTotal = e.dishes.reduce((sum, d) => sum + (dishPrice(d) ?? 0), 0);
  const hasAnyPrice = e.dishes.some((d) => dishPrice(d) !== undefined);

  async function removeDishById(dishId: string) {
    const dish = e.dishes.find((d) => d.id === dishId);
    const label = dish?.name.trim() || 'this dish';
    if (!window.confirm(`Remove "${label}"?`)) return;
    const next: KitchenEvent = {
      ...e,
      dishes: e.dishes.filter((d) => d.id !== dishId),
      sections: removeDishFromAllSections(e.sections, dishId),
      updatedAt: Date.now(),
    };
    await saveEvent(next);
    setState({ kind: 'ready', event: next });
  }

  async function setDishColorById(dishId: string, colorTag: ColorTag | undefined) {
    const next: KitchenEvent = {
      ...e,
      dishes: e.dishes.map((d) => (d.id === dishId ? { ...d, colorTag } : d)),
      updatedAt: Date.now(),
    };
    await saveEvent(next);
    setState({ kind: 'ready', event: next });
  }

  async function setDishStartAtById(dishId: string, startAt: string) {
    const next: KitchenEvent = {
      ...e,
      dishes: e.dishes.map((d) => (d.id === dishId ? { ...d, startAt } : d)),
      updatedAt: Date.now(),
    };
    await saveEvent(next);
    setState({ kind: 'ready', event: next });
  }

  // Inline dish-field patch handlers — same shape as setDishStartAtById /
  // setDishColorById. Each one immutably replaces a single field on a single
  // dish, bumps updatedAt, persists, and re-renders. The DishRow inline editor
  // is responsible for upstream validation (e.g. clamping portions to >= 1,
  // dropping empty names) so we don't second-guess here.
  async function setDishNameById(dishId: string, name: string) {
    const next: KitchenEvent = {
      ...e,
      dishes: e.dishes.map((d) => (d.id === dishId ? { ...d, name } : d)),
      updatedAt: Date.now(),
    };
    await saveEvent(next);
    setState({ kind: 'ready', event: next });
  }

  async function setDishPortionsById(dishId: string, portions: number) {
    const next: KitchenEvent = {
      ...e,
      dishes: e.dishes.map((d) => (d.id === dishId ? { ...d, portions } : d)),
      updatedAt: Date.now(),
    };
    await saveEvent(next);
    setState({ kind: 'ready', event: next });
  }

  async function setDishNotesById(dishId: string, notes: string) {
    // Normalise '' → undefined so the Dish shape stays consistent with the
    // schema (notes is optional) and read paths can keep checking truthy.
    const nextNotes = notes.trim().length > 0 ? notes : undefined;
    const next: KitchenEvent = {
      ...e,
      dishes: e.dishes.map((d) => (d.id === dishId ? { ...d, notes: nextNotes } : d)),
      updatedAt: Date.now(),
    };
    await saveEvent(next);
    setState({ kind: 'ready', event: next });
  }

  // Sections + DnD — mirrors EventEditor's pattern so chefs don't need to
  // navigate to the editor to reorder dishes or organise sections. Every
  // mutation persists the whole event via saveEvent.
  async function setSections(nextSections: EventSection[]) {
    const next: KitchenEvent = { ...e, sections: nextSections, updatedAt: Date.now() };
    await saveEvent(next);
    setState({ kind: 'ready', event: next });
  }

  function addSection() {
    const current = e.sections ?? [];
    const fresh: EventSection = {
      id: `sec_${randomId()}`,
      name: `Section ${current.length + 1}`,
      dishIds: [],
    };
    void setSections([...current, fresh]);
  }

  function renameSection(sectionId: string, name: string) {
    const current = e.sections ?? [];
    void setSections(current.map((s) => (s.id === sectionId ? { ...s, name } : s)));
  }

  function removeSection(sectionId: string) {
    const current = e.sections ?? [];
    const target = current.find((s) => s.id === sectionId);
    if (!target) return;
    const label = target.name.trim() || 'this section';
    const msg = target.dishIds.length
      ? `Remove "${label}"? Its ${target.dishIds.length} dish${target.dishIds.length === 1 ? '' : 'es'} will return to Unassigned.`
      : `Remove "${label}"?`;
    if (!window.confirm(msg)) return;
    void setSections(current.filter((s) => s.id !== sectionId));
  }

  function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const destSectionId =
      destination.droppableId === UNASSIGNED_DROPPABLE ? null : destination.droppableId;
    const next = moveDishToSection(e.sections, draggableId, destSectionId, destination.index);
    void setSections(next);
  }

  // Writes back to the LINKED RECIPE, not the dish — there's no dish-level
  // price field. Patches the local allRecipes array in place so the derived
  // recipesById Map updates and the affected timeline row re-renders without
  // a round-trip through the recipe-loading useEffect.
  async function setRecipePricePerPortion(recipeId: string, next: number | undefined) {
    const existing = recipesById.get(recipeId);
    if (!existing) return;
    const updated: Recipe = { ...existing, pricePerPortion: next, updatedAt: Date.now() };
    await saveRecipe(updated);
    setAllRecipes((prev) => prev.map((r) => (r.id === recipeId ? updated : r)));
  }

  // Picked from the name-edit autocomplete dropdown. Sets BOTH dish.recipeId
  // and dish.name (= recipe.title) so the row reflects the link immediately.
  async function linkRecipeToDish(dishId: string, recipe: Recipe) {
    const next: KitchenEvent = {
      ...e,
      dishes: e.dishes.map((d) =>
        d.id === dishId
          ? { ...d, recipeId: recipe.id, name: recipe.title, isPrepared: false }
          : d,
      ),
      updatedAt: Date.now(),
    };
    await saveEvent(next);
    setState({ kind: 'ready', event: next });
  }

  async function confirmAddDish(newDish: Dish) {
    const next: KitchenEvent = {
      ...e,
      dishes: [...e.dishes, newDish],
      updatedAt: Date.now(),
    };
    await saveEvent(next);
    setState({ kind: 'ready', event: next });
    setAddDishUi({ open: false });
  }

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-2">
        <Link to="/events" className="btn-secondary text-sm inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Events
        </Link>
        <WorkflowCta event={e} />
      </header>

      <div className="relative rounded-lg border border-slate-200 dark:border-slate-700 p-6 bg-white dark:bg-kitchen-ink">
        <button
          type="button"
          onClick={() => setDetailsSheetOpen(true)}
          aria-label="Edit event details"
          data-testid="event-view-edit-details"
          className="absolute top-4 right-4 p-1.5 rounded text-slate-400 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          title="Edit event details"
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
        </button>
        <h1 className="text-3xl font-bold pr-8" data-testid="event-view-title">{e.title || 'Untitled event'}</h1>
        <div className="mt-3 flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Calendar className="h-4 w-4" aria-hidden="true" />
          <span>{formatDateTime(e.serveAt)}</span>
        </div>
        {e.location && (
          <div className="mt-2 flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-accent hover:underline"
              title="Open in Google Maps"
            >
              {e.location}
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
            </a>
          </div>
        )}
        {(e.contactName || e.contactEmail || e.contactPhone) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-400">
            {e.contactName && (
              <span className="inline-flex items-center gap-2">
                <User className="h-4 w-4" aria-hidden="true" />
                {e.contactName}
              </span>
            )}
            {e.contactEmail && (
              <a
                href={`mailto:${e.contactEmail}`}
                className="inline-flex items-center gap-2 hover:text-accent hover:underline"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {e.contactEmail}
              </a>
            )}
            {e.contactPhone && (
              <a
                href={`tel:${e.contactPhone.replace(/[^+\d]/g, '')}`}
                className="inline-flex items-center gap-2 hover:text-accent hover:underline"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {e.contactPhone}
              </a>
            )}
          </div>
        )}
        {e.numberOfGuests !== undefined && (
          <div className="mt-2 flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Users className="h-4 w-4" aria-hidden="true" />
            <span>
              {e.numberOfGuests} guest{e.numberOfGuests === 1 ? '' : 's'}
            </span>
          </div>
        )}
        {e.notes && (
          <div className="mt-3 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
            <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <NotesList notes={e.notes} />
            </div>
          </div>
        )}
      </div>

      <MenuCheckPanel
        event={e}
        onAnalysisChange={(menuAnalysis: MenuAnalysis) =>
          setState({ kind: 'ready', event: { ...e, menuAnalysis } })
        }
      />

      <div>
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Timeline ({e.dishes.length} dish{e.dishes.length === 1 ? '' : 'es'})
          </h2>
          {hasAnyPrice && (
            <span
              className="text-sm font-semibold inline-flex items-center gap-1 text-slate-700 dark:text-slate-300"
              title="Sum of priced dishes (price/portion × portions)"
            >
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              Total {formatGBP(eventTotal)}
            </span>
          )}
        </div>
        {dishGroups.length === 0 && !addDishUi.open ? (
          <p className="text-sm text-slate-500 italic">No dishes added.</p>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="space-y-5">
              {dishGroups.map((group) => {
                const droppableId = group.sectionId ?? UNASSIGNED_DROPPABLE;
                const sectionRecord = group.sectionId
                  ? (e.sections ?? []).find((s) => s.id === group.sectionId)
                  : undefined;
                return (
                  <section key={droppableId}>
                    {sectionRecord ? (
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={sectionRecord.name}
                          onChange={(ev) => renameSection(sectionRecord.id, ev.target.value)}
                          className="flex-1 bg-transparent text-xs font-semibold uppercase tracking-wide
                                     text-slate-700 dark:text-slate-200 border-0 border-b border-transparent
                                     hover:border-slate-300 focus:border-accent focus:outline-none
                                     px-1 py-0.5"
                          aria-label="Section name"
                          placeholder="Section name"
                        />
                        <button
                          type="button"
                          onClick={() => removeSection(sectionRecord.id)}
                          aria-label={`Remove section "${sectionRecord.name}"`}
                          className="touch-target text-slate-400 hover:text-red-600 px-2 rounded"
                          title="Remove section"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                        {group.label}
                      </h3>
                    )}
                    <Droppable droppableId={droppableId}>
                      {(dropProvided: DroppableProvided) => (
                        <ol
                          ref={dropProvided.innerRef}
                          {...dropProvided.droppableProps}
                          className="space-y-3 min-h-[2.5rem]"
                        >
                          {group.dishes.map((d, i) => (
                            <Draggable key={d.id} draggableId={d.id} index={i}>
                              {(dragProvided: DraggableProvided) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  className="flex items-start gap-2"
                                >
                                  <span
                                    {...dragProvided.dragHandleProps}
                                    className="touch-target text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 pt-3 cursor-grab"
                                    aria-label={`Drag dish ${d.name || 'Untitled'}`}
                                    title="Drag to reorder or move between sections"
                                  >
                                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <DishRow
                                      index={i}
                                      value={d}
                                      reorderMode={false}
                                      canMoveUp={false}
                                      canMoveDown={false}
                                      onEdit={() => navigate(`/events/${e.id}/edit`)}
                                      onRemove={() => void removeDishById(d.id)}
                                      onColorChange={(c) => void setDishColorById(d.id, c)}
                                      onTimeChange={(iso) => void setDishStartAtById(d.id, iso)}
                                      onNameChange={(next) => void setDishNameById(d.id, next)}
                                      onPortionsChange={(next) => void setDishPortionsById(d.id, next)}
                                      onNotesChange={(next) => void setDishNotesById(d.id, next)}
                                      pricePerPortion={
                                        d.recipeId
                                          ? recipesById.get(d.recipeId)?.pricePerPortion
                                          : undefined
                                      }
                                      onPricePerPortionChange={
                                        d.recipeId
                                          ? (next) => void setRecipePricePerPortion(d.recipeId!, next)
                                          : undefined
                                      }
                                      recipes={allRecipes}
                                      onLinkRecipe={(recipe) =>
                                        void linkRecipeToDish(d.id, recipe)
                                      }
                                      onMoveUp={() => undefined}
                                      onMoveDown={() => undefined}
                                    />
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {dropProvided.placeholder}
                        </ol>
                      )}
                    </Droppable>
                  </section>
                );
              })}
            </div>
          </DragDropContext>
        )}

        <div className="mt-4 flex flex-wrap gap-2 items-start">
          {addDishUi.open ? (
            <DishForm
              initial={addDishUi.draft}
              eventServeAt={e.serveAt}
              onConfirm={(next) => void confirmAddDish(next)}
              onCancel={() => setAddDishUi({ open: false })}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAddDishUi({ open: true, draft: blankDish(e.serveAt) })}
                className="btn-secondary text-sm inline-flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add dish
              </button>
              <button
                type="button"
                onClick={addSection}
                className="btn-secondary text-sm inline-flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add section
              </button>
            </>
          )}
        </div>
      </div>

      <EventDetailsSheet
        open={detailsSheetOpen}
        event={e}
        onClose={() => setDetailsSheetOpen(false)}
        onSave={async (next) => {
          const updated: KitchenEvent = { ...next, updatedAt: Date.now() };
          await saveEvent(updated);
          setState({ kind: 'ready', event: updated });
          setDetailsSheetOpen(false);
        }}
      />
    </section>
  );
}

// Conditional workflow CTA — when the event has a saved workflow snapshot,
// surface "View workflow" + a step count / timestamp so the chef knows it's
// there and can jump straight in without re-running the LLM. Otherwise keep
// the original "Generate Workflow" affordance.
function WorkflowCta({ event }: { event: KitchenEvent }) {
  const steps = event.workflow ?? [];
  const hasWorkflow = steps.length > 0;
  if (!hasWorkflow) {
    return (
      <Link
        to={`/workflows/${event.id}`}
        className="btn-primary inline-flex items-center gap-2"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Generate Workflow
      </Link>
    );
  }
  // Use the first step's startAt as a stable "last generated" anchor; the
  // schedule itself is the timestamp source we trust most.
  const firstStart = steps[0]?.startAt;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <Link
        to={`/workflows/${event.id}`}
        className="btn-primary inline-flex items-center gap-2"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        View workflow
      </Link>
      <span className="text-[11px] text-slate-500 dark:text-slate-400">
        {steps.length} step{steps.length === 1 ? '' : 's'}
        {firstStart && <> · starts {formatDateTime(firstStart).split(',').slice(-1)[0].trim()}</>}
      </span>
    </div>
  );
}

