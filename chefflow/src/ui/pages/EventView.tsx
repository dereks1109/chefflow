import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Edit3, ExternalLink, Layers, Mail, MapPin, Phone, Plus, Sparkles, StickyNote, User, Wallet } from 'lucide-react';
import { getEvent, saveEvent } from '../../db/eventsRepo';
import { getRecipe } from '../../db/recipesRepo';
import DishForm, { blankDish } from '../components/DishForm';
import DishRow from '../components/DishRow';
import EventDetailsSheet from '../components/EventDetailsSheet';
import MenuCheckPanel from '../components/MenuCheckPanel';
import { formatDateTime } from '../../core/util/datetime';
import { formatGBP } from '../../core/util/money';
import { groupDishesBySections, removeDishFromAllSections } from '../../core/events/sections';
import type { ColorTag, Dish, KitchenEvent, MenuAnalysis, Recipe } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; event: KitchenEvent };

type AddDishUi = { open: false } | { open: true; draft: Dish };

export default function EventView() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Recipe lookup keyed by recipeId. Populated after the event loads so dishes
  // can be priced (recipe.pricePerPortion × dish.portions) for the per-dish
  // line + event-total summary.
  const [recipesById, setRecipesById] = useState<Map<string, Recipe>>(new Map());
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

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const ids = Array.from(
      new Set(
        state.event.dishes
          .map((d) => d.recipeId)
          .filter((rid): rid is string => Boolean(rid)),
      ),
    );
    if (ids.length === 0) {
      setRecipesById(new Map());
      return;
    }
    let cancelled = false;
    void Promise.all(ids.map((rid) => getRecipe(rid))).then((loaded) => {
      if (cancelled) return;
      const next = new Map<string, Recipe>();
      for (const r of loaded) if (r) next.set(r.id, r);
      setRecipesById(next);
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

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
        {e.notes && (
          <div className="mt-3 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
            <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <p className="whitespace-pre-wrap">{e.notes}</p>
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
          <div className="space-y-5">
            {dishGroups.map((group) => (
              <section key={group.sectionId ?? 'unassigned'}>
                {group.sectionId !== undefined && (
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    {group.label}
                  </h3>
                )}
                <ol className="space-y-3">
                  {group.dishes.map((d, i) => (
                    <DishRow
                      key={d.id}
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
                      onMoveUp={() => undefined}
                      onMoveDown={() => undefined}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        <div className="mt-4">
          {addDishUi.open ? (
            <DishForm
              initial={addDishUi.draft}
              eventServeAt={e.serveAt}
              onConfirm={(next) => void confirmAddDish(next)}
              onCancel={() => setAddDishUi({ open: false })}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddDishUi({ open: true, draft: blankDish(e.serveAt) })}
              className="btn-secondary text-sm inline-flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add dish
            </button>
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

