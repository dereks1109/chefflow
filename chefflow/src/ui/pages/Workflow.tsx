import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  ChefHat,
  Check,
  Compass,
  Key,
  Printer,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import NestedDragDropBuilder, {
  type DndMilestone,
} from '../components/NestedDragDropBuilder';
import EventDetailCard from '../components/EventDetailCard';
import CommuteBanner from '../components/CommuteBanner';
import { swatchClassFor } from '../components/ColorPicker';
import LlmSettingsSheet from '../components/LlmSettingsSheet';
import SharedReadOnlyBanner from '../components/SharedReadOnlyBanner';
import { saveEvent } from '../../db/eventsRepo';
import { useEvent, useRecipes } from '../../db/hooks/useEvent';
import {
  GroqClientError,
  LlmValidationError,
  scheduleWithFallback,
  StrategyError,
  hashDishes,
} from '../../core/scheduler';
import { aggregateIngredients } from '../../core/recipes/aggregateIngredients';
import { useAuthGate } from '../../state/useAuthGate';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { LlmDailyQuotaExceededError } from '../../core/llm/llmClient';
import type {
  ColorTag,
  Dish,
  KitchenEvent,
  Recipe,
  ScheduledStep,
  SchedulePhase,
} from '../../core/types';

type WorkflowStatus =
  | { kind: 'idle' }              // initial — before we know what to do
  | { kind: 'needs-key' }         // event ready, no snapshot, no API key
  | { kind: 'generating' }
  | { kind: 'error'; message: string }
  | { kind: 'quota-exceeded' }    // chef hit the daily LLM cap — show inline upgrade prompt
  | { kind: 'ready' };

// ---------------------------------------------------------------------------
// Adapter — same as before, just the DnD-shape helpers.
// ---------------------------------------------------------------------------
const PHASE_ORDER: SchedulePhase[] = ['prep', 'sanitize', 'cook', 'serve'];
const PHASE_LABEL: Record<SchedulePhase, string> = {
  prep: 'Prep',
  sanitize: 'Sanitize',
  cook: 'Cook',
  serve: 'Serve',
};
const MILESTONE_ID_TO_PHASE: Record<string, SchedulePhase> = {
  'phase-prep': 'prep',
  'phase-sanitize': 'sanitize',
  'phase-cook': 'cook',
  'phase-serve': 'serve',
};

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function scheduledStepsToMilestones(
  steps: ScheduledStep[],
  dishes: readonly Dish[] = [],
  orderList?: {
    lines: {
      amount: number;
      unit: string;
      name: string;
      dishNames: string[];
      breakdown: { amount: number; unit: string; dishName: string }[];
    }[];
    warnings: { message: string }[];
  },
): DndMilestone[] {
  const dishById = new Map(dishes.map((d) => [d.id, d]));
  const byPhase = new Map<SchedulePhase, ScheduledStep[]>();
  for (const phase of PHASE_ORDER) byPhase.set(phase, []);
  for (const step of steps) {
    if (!byPhase.has(step.phase)) byPhase.set(step.phase, []);
    byPhase.get(step.phase)!.push(step);
  }
  const milestones: DndMilestone[] = [];

  // Prepend a synthetic "Order list" milestone aggregating ingredients
  // across every dish in the event. Steps inside don't carry timing /
  // dependencies — they're a read-only shopping list.
  //
  // Render shape: ONE step per ingredient name (case-insensitive). The
  // step's content is the canonical name (e.g. "Black pepper"); the
  // meta.breakdown carries per-dish per-unit rows ("10g for Salad",
  // "10 tsp for Ribeye") so chefs see each dish's actual share rather
  // than a single aggregate like "15g black pepper for [Salad, Lamb]"
  // (which obscured the tsp-based contribution from Ribeye entirely).
  if (orderList && (orderList.lines.length > 0 || orderList.warnings.length > 0)) {
    const byName = new Map<string, typeof orderList.lines>();
    for (const line of orderList.lines) {
      const key = line.name.toLowerCase();
      const bucket = byName.get(key);
      if (bucket) bucket.push(line);
      else byName.set(key, [line]);
    }
    const orderSteps = Array.from(byName.values()).map((group, idx) => ({
      id: `order-${idx}`,
      content: group[0].name,
      meta: {
        breakdown: group.flatMap((l) => l.breakdown),
      },
    }));
    // Surface aggregation warnings as muted entries at the end of the list.
    for (const w of orderList.warnings) {
      orderSteps.push({
        id: `order-warn-${orderSteps.length}`,
        content: `⚠ ${w.message}`,
        meta: { breakdown: [] },
      });
    }
    const itemCount = byName.size;
    milestones.push({
      id: 'phase-order-list',
      title: `Order list — ${itemCount} item${itemCount === 1 ? '' : 's'}`,
      steps: orderSteps,
    });
  }

  for (const phase of PHASE_ORDER) {
    const stepsForPhase = byPhase.get(phase) ?? [];
    if (stepsForPhase.length === 0) continue;
    stepsForPhase.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
    const firstStart = formatClockTime(stepsForPhase[0].startAt);
    const lastEnd = formatClockTime(stepsForPhase[stepsForPhase.length - 1].endAt);
    milestones.push({
      id: `phase-${phase}`,
      title: `${PHASE_LABEL[phase]} — ${firstStart} to ${lastEnd}`,
      steps: stepsForPhase.map((s) => ({
        id: s.id,
        content: s.text,
        meta: {
          time: formatClockTime(s.startAt),
          dish: s.dishLabel,
          dishId: s.dishId,
          rules: s.rulesApplied,
          colorTag: dishById.get(s.dishId)?.colorTag,
        },
      })),
    });
  }
  return milestones;
}

export function milestonesToScheduledSteps(
  milestones: DndMilestone[],
  byOriginalId: Map<string, ScheduledStep>,
  serveAt: Date,
): ScheduledStep[] {
  const ordered: ScheduledStep[] = [];
  for (const milestone of milestones) {
    // The synthetic order-list milestone is UI-only; its "steps" are
    // aggregated ingredients, not ScheduledSteps. Skip cleanly so the
    // saved workflow snapshot stays a pure ScheduledStep[].
    if (milestone.id === 'phase-order-list') continue;
    const inferredPhase = MILESTONE_ID_TO_PHASE[milestone.id];
    for (const dndStep of milestone.steps) {
      const original = byOriginalId.get(dndStep.id);
      if (!original) continue;
      ordered.push({
        ...original,
        text: dndStep.content,
        phase: inferredPhase ?? original.phase,
      });
    }
  }
  if (ordered.length === 0) return ordered;
  let cursorMs = serveAt.getTime();
  for (let i = ordered.length - 1; i >= 0; i--) {
    const endMs = cursorMs;
    const startMs = endMs - ordered[i].durationSec * 1000;
    ordered[i] = {
      ...ordered[i],
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
    };
    cursorMs = startMs;
  }
  return ordered;
}

interface ChefGroup {
  color: ColorTag;
  dishCount: number;
}

function buildChefGroups(dishes: readonly Dish[]): ChefGroup[] {
  const groups = new Map<ColorTag, ChefGroup>();
  for (const dish of dishes) {
    if (!dish.colorTag) continue;
    const existing = groups.get(dish.colorTag);
    if (existing) existing.dishCount++;
    else groups.set(dish.colorTag, { color: dish.colorTag, dishCount: 1 });
  }
  return Array.from(groups.values());
}

// ===========================================================================
// Page
// ===========================================================================

export default function Workflow() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const requireAuth = useAuthGate();

  // Live subscriptions — re-render automatically when Dexie writes anywhere
  // touch the watched rows. See src/db/hooks/useEvent.ts.
  const eventQuery = useEvent(eventId);
  const recipesQuery = useRecipes();

  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>({ kind: 'idle' });
  const [scheduled, setScheduled] = useState<ScheduledStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [chefFilter, setChefFilter] = useState<ColorTag | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Forces the DnD builder to remount on Regenerate.
  const [generation, setGeneration] = useState(0);
  // True once the page has consumed the saved snapshot for the current event.
  // Reset by Regenerate (which clears event.workflow in Dexie). Drives the
  // "stale snapshot" banner and the Save button's enabled state.
  const [loadedFromSnapshot, setLoadedFromSnapshot] = useState(false);
  // AbortController for in-flight LLM calls (so Regenerate can cancel).
  const inflight = useRef<AbortController | null>(null);
  // True when the currently-displayed timeline came from the local
  // deterministic scheduler (no API key, or LLM threw). Drives an inline
  // notice + a hint to click Regenerate once the LLM is reachable.
  const [isFallback, setIsFallback] = useState(false);
  // Tracks the event-version we last synced our local UI state to. The
  // initial-load effect only acts when this changes — so live-query updates
  // we triggered ourselves (Save / Regenerate) don't cause a re-init loop.
  const syncedVersionRef = useRef<string | null>(null);

  const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
  const model = useLlmSettingsStore((s) => s.model);
  // In proxy mode the Worker handles auth via Clerk JWT — no Groq key needed
  // at the call site. In groq dev mode the localStorage + env fallback stands.
  // (The 'proxy' placeholder is never sent over the wire; llmClient short-
  // circuits to the proxy in this mode, but the readiness gate needs a
  // non-empty string.)
  const isProxyMode = (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy';
  const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
  const apiKey = isProxyMode ? 'proxy' : (storedApiKey || envApiKey).trim();
  const isReady = isProxyMode || apiKey.length > 0;

  // Derive a stable recipes-by-id map from the live query result. Memoized
  // on the array reference so the LLM caller sees the same Map identity for
  // unchanged recipe state.
  const recipesMap = useMemo(
    () => new Map(recipesQuery.recipes.map((r) => [r.id, r])),
    [recipesQuery.recipes],
  );

  // -------------------------------------------------------------------------
  // runLlm — call the LLM, set scheduled state, surface errors.
  // Defined before the sync-effect that calls it, but doesn't need to be a
  // hook itself — it reads `apiKey` / `model` via closure each call.
  // -------------------------------------------------------------------------
  async function runSchedule(eventToSchedule: KitchenEvent, recipes: Map<string, Recipe>) {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;

    setWorkflowStatus({ kind: 'generating' });
    try {
      const result = await scheduleWithFallback({
        event: eventToSchedule,
        recipes,
        apiKey,
        model,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setScheduled(result.steps);
      setIsFallback(result.source === 'local');
      setDirty(false);
      setWorkflowStatus({ kind: 'ready' });

      // Persist the generated snapshot immediately so a refresh or a
      // sign-in on another device picks it up via the sync engine
      // instead of re-running the LLM. Skip empty results (no point
      // saving nothing — keeps event.workflow undefined so the next
      // mount still tries to generate). The repo write flips
      // `synced: false`; the existing sync engine pushes it to D1's
      // events.payload JSON blob — no schema change needed.
      if (result.steps.length > 0) {
        const snapshot: KitchenEvent = {
          ...eventToSchedule,
          workflow: result.steps,
          workflowDishesHash: hashDishes(eventToSchedule.dishes),
          updatedAt: Date.now(),
        };
        await saveEvent(snapshot);
        // Mirror handleSave's trick: pre-set the version key so the
        // mount effect doesn't re-adopt the snapshot we just wrote.
        syncedVersionRef.current = `${snapshot.id}::snapshot`;
        setLoadedFromSnapshot(true);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      // Both LLM and local scheduler failed — strategy raised StrategyError.
      // Show the LLM error (more user-actionable) when present; otherwise
      // the local one.
      const stratErr = err instanceof StrategyError ? (err.llmError ?? err.localError) : err;
      // Daily LLM-quota exhaustion → open the upgrade sheet AND set an
      // inline status so the page shows an explanation even if the chef
      // dismisses the modal. Pre-2026-05-28 this set 'ready' with an
      // empty scheduled list, which left the page blank.
      if (stratErr instanceof LlmDailyQuotaExceededError) {
        useUpgradeSheetStore.getState().openWith('llm');
        setWorkflowStatus({ kind: 'quota-exceeded' });
        return;
      }
      setWorkflowStatus({ kind: 'error', message: friendlyError(stratErr) });
    }
  }

  // -------------------------------------------------------------------------
  // Sync effect — when the underlying event becomes ready (or its
  // snapshot-presence flips), reconcile local UI state. The version key
  // includes workflow presence + id so reruns of the LLM after a Regenerate
  // are detected, but routine cosmetic writes (e.g. updatedAt-only) that
  // don't change workflow presence don't cause a re-init.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (eventQuery.status !== 'ready' || recipesQuery.status !== 'ready') return;
    const live = eventQuery.event;
    const hasSnapshot = !!live.workflow && live.workflow.length > 0;
    const version = `${live.id}::${hasSnapshot ? 'snapshot' : 'no-snapshot'}`;
    if (syncedVersionRef.current === version) return;
    syncedVersionRef.current = version;

    setChefFilter(null);

    if (hasSnapshot) {
      setScheduled(live.workflow!);
      setDirty(false);
      setLoadedFromSnapshot(true);
      setWorkflowStatus({ kind: 'ready' });
      return;
    }

    setLoadedFromSnapshot(false);
    // Single seam — strategy decides LLM vs local. Empty apiKey falls
    // through to local automatically (no special-casing here).
    void runSchedule(live, recipesMap);
  // runLlm/recipesMap/isReady are intentionally not in deps — we only react
  // to event-version changes. Capturing them would cause re-runs on
  // unrelated re-renders (e.g. setSettingsOpen).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventQuery, recipesQuery.status]);

  const scheduledById = useMemo(
    () => new Map(scheduled.map((s) => [s.id, s])),
    [scheduled],
  );

  // Whether the on-screen workflow differs from what's persisted in Dexie.
  // True in two cases:
  //   - dirty: chef drag-reordered steps since the last save / fresh gen.
  //   - !loadedFromSnapshot: the workflow was just produced by the LLM /
  //     local scheduler and has never been persisted yet.
  // Drives the Save button's prominence, the "Unsaved" pill, and the
  // beforeunload guard. (No in-app navigation blocker: useBlocker needs
  // a data router and the app mounts a regular BrowserRouter — the loud
  // orange button + pill is the in-app deterrent.)
  const needsSave =
    workflowStatus.kind === 'ready' &&
    scheduled.length > 0 &&
    (dirty || !loadedFromSnapshot);

  // Browser-level guard: warn on tab close / refresh while unsaved.
  useEffect(() => {
    if (!needsSave) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [needsSave]);

  if (eventQuery.status === 'loading' || recipesQuery.status === 'loading') {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }
  if (eventQuery.status === 'not-found' || eventQuery.status === 'error') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Event not found.</h1>
        <Link to="/workflows" className="btn-secondary mt-4 inline-flex">
          Back to workflows
        </Link>
      </div>
    );
  }

  // From here on `event` is non-null (narrowed by the status check above).
  const event: KitchenEvent = eventQuery.event;
  const hasDishes = event.dishes.length > 0;
  const serveAt = event.serveAt ? new Date(event.serveAt) : new Date();
  const currentDishesHash = hashDishes(event.dishes);
  const isStale =
    loadedFromSnapshot &&
    !!event.workflowDishesHash &&
    event.workflowDishesHash !== currentDishesHash;

  const chefGroups = buildChefGroups(event.dishes);
  const dishById = new Map(event.dishes.map((d) => [d.id, d]));
  const visibleSteps = chefFilter
    ? scheduled.filter((s) => dishById.get(s.dishId)?.colorTag === chefFilter)
    : scheduled;
  // Order list — show event-wide in the All view, AND a per-chef filtered
  // list when a chef colour is selected (their shopping list, not the
  // entire event's). Filter dishes by colorTag before aggregating; the
  // function is pure so we just feed it a slimmer event.
  const orderListEvent: KitchenEvent = chefFilter
    ? { ...event, dishes: event.dishes.filter((d) => d.colorTag === chefFilter) }
    : event;
  const orderList = aggregateIngredients({ event: orderListEvent, recipes: recipesMap });
  const milestones = scheduledStepsToMilestones(visibleSteps, event.dishes, orderList);

  function handleBuilderChange(nextMilestones: DndMilestone[]) {
    const next = milestonesToScheduledSteps(nextMilestones, scheduledById, serveAt);
    setScheduled(next);
    setDirty(true);
  }

  async function handleSave() {
    if (!window.confirm('Save this workflow to the event?')) return;
    const updated: KitchenEvent = {
      ...event,
      workflow: scheduled,
      workflowDishesHash: currentDishesHash,
      updatedAt: Date.now(),
    };
    await saveEvent(updated);
    setDirty(false);
    // The next live-query tick will flip hasSnapshot true; pre-set the
    // synced version so we don't re-adopt the snapshot we just wrote
    // (which would no-op anyway, but also avoid a transient flicker).
    syncedVersionRef.current = `${updated.id}::snapshot`;
    setLoadedFromSnapshot(true);
    // Return to the event page — its new "View workflow" CTA now reflects
    // this saved snapshot so the chef can re-enter at will.
    navigate(`/events/${updated.id}`);
  }

  async function handleRegenerate() {
    if (
      dirty &&
      !window.confirm('Regenerate from rules? Unsaved reorder will be discarded.')
    ) return;
    if (!isReady) {
      setWorkflowStatus({ kind: 'needs-key' });
      return;
    }
    const cleared: KitchenEvent = {
      ...event,
      workflow: undefined,
      workflowDishesHash: undefined,
      updatedAt: Date.now(),
    };
    await saveEvent(cleared);
    setDirty(false);
    setChefFilter(null);
    setLoadedFromSnapshot(false);
    setGeneration((g) => g + 1);
    // Pre-mark so the sync-effect's next pass (triggered by the live-query
    // refresh) skips its branch — we run the LLM here directly.
    syncedVersionRef.current = `${cleared.id}::no-snapshot`;
    await runSchedule(cleared, recipesMap);
  }

  const showWorkflowBody = workflowStatus.kind === 'ready' && scheduled.length > 0;

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 print:p-0 print:space-y-2 print:text-black print:[&_*]:!text-black">
      <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/workflows" className="btn-secondary text-sm inline-flex items-center gap-1 w-fit">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Workflows
          </Link>
          <Link
            to={`/events/${event.id}`}
            className="btn-secondary text-sm inline-flex items-center gap-1 w-fit"
            title={`Back to ${event.title || 'this event'}`}
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <span className="truncate max-w-[12rem]">{event.title || 'Event'}</span>
          </Link>
        </div>
      </div>

      {event.readOnly && <SharedReadOnlyBanner scope="workflow" />}

      <EventDetailCard event={event} />

      <CommuteBanner eventLocation={event.location} serveAt={event.serveAt} />

      <div>
        <div className="flex items-center justify-between mb-3 gap-2 print:hidden">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            Workflow
          </h2>
          <div className="flex gap-2">
            {/* T3c Phase 4 — Regenerate + Save are owner-only. A member
                viewing a shared event's saved workflow can still browse
                + print it; mutations stay with the owner. */}
            {!event.readOnly && (
              <button
                type="button"
                onClick={() => requireAuth(() => void handleRegenerate())}
                disabled={workflowStatus.kind === 'generating'}
                className="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Discard saved snapshot and re-run the LLM"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${workflowStatus.kind === 'generating' ? 'animate-spin' : ''}`} aria-hidden="true" />
                Regenerate
              </button>
            )}
            {!event.readOnly && needsSave && (
              <span
                data-testid="workflow-unsaved-pill"
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              >
                Unsaved
              </span>
            )}
            {!event.readOnly && <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!needsSave}
              data-testid="workflow-save-button"
              className={`text-sm inline-flex items-center gap-1 disabled:cursor-not-allowed ${
                needsSave ? 'btn-primary' : 'btn-secondary opacity-70'
              }`}
              title={needsSave ? 'Save this workflow to the event' : 'Already saved'}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {needsSave ? 'Save changes' : 'Saved'}
            </button>}
          </div>
        </div>

        {/* ----- Workflow status banners ----- */}
        {workflowStatus.kind === 'needs-key' && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 text-sm">
            <Key className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">Connect Groq to generate a workflow.</p>
              <p className="text-slate-600 dark:text-slate-400 mt-1 text-xs">
                Plan 4 uses Llama 3.3 70B (free tier on Groq) to combine your dishes + CulinaryRule.md into a kitchen
                schedule. Paste an API key once; it stays in your browser only.
              </p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="btn-primary text-sm mt-3 inline-flex items-center gap-1"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Connect Groq
              </button>
            </div>
          </div>
        )}

        {workflowStatus.kind === 'generating' && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 text-sm text-slate-600 dark:text-slate-400">
            <Sparkles className="h-4 w-4 animate-pulse text-accent" aria-hidden="true" />
            AI is building your workflow…
          </div>
        )}

        {workflowStatus.kind === 'error' && (
          <div
            role="status"
            className="mb-3 flex items-start gap-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-900 dark:text-red-200"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">Couldn't generate the workflow.</p>
              <p className="mt-1 text-xs whitespace-pre-wrap">{workflowStatus.message}</p>
              <button
                type="button"
                onClick={() => requireAuth(() => void handleRegenerate())}
                className="btn-secondary text-xs mt-2 inline-flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Retry
              </button>
            </div>
          </div>
        )}

        {workflowStatus.kind === 'quota-exceeded' && (
          <div
            role="status"
            data-testid="workflow-quota-exceeded"
            className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">Daily AI workflow generation limit reached.</p>
              <p className="mt-1 text-xs">
                Free accounts get a limited number of AI calls per day. Upgrade to keep generating workflows today, or try again after UTC midnight.
              </p>
              <button
                type="button"
                onClick={() => useUpgradeSheetStore.getState().openWith('llm')}
                className="mt-2 inline-flex items-center gap-1 px-3 h-8 rounded-md text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white"
              >
                Upgrade to Pro
              </button>
            </div>
          </div>
        )}

        {isFallback && workflowStatus.kind === 'ready' && (
          <div
            role="status"
            className="mb-3 flex items-start gap-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 text-sm text-slate-700 dark:text-slate-300 print:hidden"
          >
            <Compass className="h-4 w-4 mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium text-slate-800 dark:text-slate-200">Fallback timeline</p>
              <p className="mt-1 text-xs">
                {isReady
                  ? <>The LLM scheduler was unavailable — this timeline is built by the local deterministic scheduler. Click <strong>Regenerate</strong> to try the LLM again.</>
                  : <>No Groq API key — this timeline is built by the local deterministic scheduler. Click <strong>Connect Groq</strong> below for the LLM-scheduled version.</>}
              </p>
              {!isReady && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="btn-secondary text-xs mt-2 inline-flex items-center gap-1"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Connect Groq
                </button>
              )}
            </div>
          </div>
        )}

        {isStale && workflowStatus.kind === 'ready' && (
          <div
            role="status"
            className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200 print:hidden"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              Dishes have changed since this workflow was saved. Click <strong>Regenerate</strong> to rebuild it from the
              current dishes, or keep your saved order and ignore the new dishes.
            </p>
          </div>
        )}

        {!hasDishes && (
          <p className="text-sm text-slate-500 italic mb-3">
            This event has no dishes yet — add some in the Events tab and the workflow will populate automatically.
          </p>
        )}

        {/* Successful schedule with NO steps — happens when every dish is
            either `isPrepared` or has no `recipeId` (so the scheduler has
            nothing to plan). Pre-2026-05-28 this rendered as a blank page
            because `showWorkflowBody` was false and there was no fallback
            message. */}
        {workflowStatus.kind === 'ready' && hasDishes && scheduled.length === 0 && (
          <p
            className="text-sm text-slate-500 italic mb-3"
            data-testid="workflow-empty-fallback"
          >
            Every dish in this event is marked as prepared (or has no recipe
            linked) — there's nothing for the scheduler to plan. Link a recipe
            to a dish (or untick "prepared") then tap <strong>Regenerate</strong>.
          </p>
        )}

        {showWorkflowBody && hasDishes && chefGroups.length === 0 && (
          <p className="text-xs text-slate-500 italic mb-3">
            Assign a color to each dish in the Events tab to enable per-chef filtering.
          </p>
        )}

        {/* ----- Print button — visible whenever the workflow is ready, prints
              the current chef-filter view (All or a single colour). ----- */}
        {showWorkflowBody && (
          <div className="mb-3 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              data-testid="workflow-print-button"
              className="btn-secondary text-sm inline-flex items-center gap-1.5"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print checklist
            </button>
          </div>
        )}

        {/* ----- Chef filter bar ----- */}
        {showWorkflowBody && hasDishes && chefGroups.length > 0 && (
          <div className="mb-3 print:hidden">
            <p className="text-xs font-medium text-slate-500 mb-2 inline-flex items-center gap-1">
              <ChefHat className="h-3 w-3" aria-hidden="true" />
              Filter by chef
            </p>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chef filter">
              <button
                type="button"
                role="tab"
                aria-selected={chefFilter === null}
                onClick={() => setChefFilter(null)}
                className={`text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors ${
                  chefFilter === null
                    ? 'bg-accent text-white border-accent'
                    : 'bg-white dark:bg-kitchen-ink border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-accent'
                }`}
              >
                All ({event.dishes.length})
              </button>
              {chefGroups.map((g) => (
                <button
                  key={g.color}
                  type="button"
                  role="tab"
                  aria-selected={chefFilter === g.color}
                  onClick={() => setChefFilter(g.color)}
                  className={`text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors ${
                    chefFilter === g.color
                      ? 'bg-accent text-white border-accent'
                      : 'bg-white dark:bg-kitchen-ink border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-accent'
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${swatchClassFor(g.color)}`} />
                  {capitalize(g.color)} ({g.dishCount})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ----- Workflow body — interactive (screen-only) ----- */}
        <div className="print:hidden">
          {showWorkflowBody && (
            milestones.length === 0 && chefFilter ? (
              <p className="text-sm text-slate-500 italic">
                No steps for this chef. (No dishes match this color, or no recipes are linked.)
              </p>
            ) : (
              <NestedDragDropBuilder
                key={`${event.id}-${generation}-${chefFilter ?? 'all'}`}
                initialMilestones={milestones}
                onChange={handleBuilderChange}
                allowAddMilestone={false}
                allowAddStep={false}
                allowColorPicker={false}
                allowStepDrag={false}
                allowMilestoneDrag={false}
                allowStepEdit={false}
              />
            )
          )}
        </div>

        {/* ----- Print-only checklist — flat list with ☐ checkboxes per step.
              Hidden on screen via `hidden`; revealed in print via Tailwind's
              `print:block`. Shows whatever the current chef filter selected
              (All view = everyone; per-chef = just that colour). ----- */}
        {showWorkflowBody && milestones.length > 0 && (
          <PrintChecklist
            milestones={milestones}
            chefLabel={chefFilter ? capitalize(chefFilter) : null}
            eventTitle={event.title || 'Untitled event'}
          />
        )}
      </div>

      <LlmSettingsSheet
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          // If user just provided a key while we were stuck on needs-key, kick off the LLM.
          if (workflowStatus.kind === 'needs-key' && useLlmSettingsStore.getState().isReady()) {
            void runSchedule(event, recipesMap);
          }
        }}
      />
    </section>
  );
}


// ---------------------------------------------------------------------------
// PrintChecklist — hidden on screen (`hidden`), revealed only when the
// page is printed (`print:block`). Renders the same milestones the
// NestedDragDropBuilder shows on screen, but as a flat checklist with
// ☐ squares for tick-off. Respects the current chef-filter (the
// `milestones` array is already filtered by the caller).
// ---------------------------------------------------------------------------
function PrintChecklist({
  milestones,
  chefLabel,
  eventTitle,
}: {
  milestones: DndMilestone[];
  chefLabel: string | null;
  eventTitle: string;
}) {
  return (
    <section
      data-testid="workflow-print-checklist"
      className="hidden print:block mt-4"
      aria-hidden="true"
    >
      <h2 className="text-lg font-bold border-b border-slate-300 pb-2 mb-4">
        Workflow checklist — {eventTitle}
        {chefLabel ? ` (${chefLabel} chef)` : ''}
      </h2>
      {milestones.map((m) => (
        <div key={m.id} className="mb-4 break-inside-avoid">
          <h3 className="text-sm font-semibold uppercase tracking-wide mb-1">{m.title}</h3>
          <ul className="text-sm leading-snug">
            {m.steps.map((s) => (
              <li key={s.id} className="flex gap-2 py-0.5">
                <span
                  className="inline-block h-3.5 w-3.5 border border-slate-700 rounded-sm shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span className="flex-1">
                  {s.meta?.time && <span className="font-mono mr-2">{s.meta.time}</span>}
                  {s.content}
                  {s.meta?.dish && (
                    <span className="ml-2 text-xs text-slate-500">— {s.meta.dish}</span>
                  )}
                  {s.meta?.dishTags && s.meta.dishTags.length > 0 && (
                    <span className="ml-2 text-xs text-slate-500">
                      — {s.meta.dishTags.join(', ')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// friendlyError — turn an error from the LLM scheduler into a user-facing
// one-liner. Keeps the original message for context but strips stack frames
// and adds a hint when the cause is well-known.
// ---------------------------------------------------------------------------
function friendlyError(err: unknown): string {
  if (err instanceof GroqClientError) {
    if (err.status === 401) return 'Invalid API key. Check your Groq key in settings.';
    if (err.status === 429) return 'Rate limited by Groq. Wait a minute and try again.';
    if (err.status === undefined) return `${err.message}\n\nIs your internet connected?`;
    return `${err.message}${err.upstreamBody ? `\n\n${err.upstreamBody}` : ''}`;
  }
  if (err instanceof LlmValidationError) {
    return `The LLM returned an invalid workflow.\n\n${err.message}\n\nTry Regenerate — JSON-mode is ~99% reliable but occasionally needs a retry.`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// Re-export for tests.
export { hashDishes } from '../../core/scheduler/hash';
