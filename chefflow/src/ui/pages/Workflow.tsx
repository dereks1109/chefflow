import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  ChefHat,
  Check,
  Clock,
  Compass,
  Key,
  RefreshCw,
  Sparkles,
  StickyNote,
  Users,
} from 'lucide-react';
import NestedDragDropBuilder, {
  type DndMilestone,
} from '../components/NestedDragDropBuilder';
import { swatchClassFor } from '../components/ColorPicker';
import LlmSettingsSheet from '../components/LlmSettingsSheet';
import { getEvent, saveEvent } from '../../db/eventsRepo';
import { listRecipes } from '../../db/recipesRepo';
import { formatDateTime } from '../../core/util/datetime';
import { scheduleEventLLM, GroqClientError, LlmValidationError } from '../../core/scheduler/llm/llmScheduler';
import { hashDishes } from '../../core/scheduler/hash';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';
import type {
  ColorTag,
  Dish,
  KitchenEvent,
  Recipe,
  ScheduledStep,
  SchedulePhase,
} from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | {
      kind: 'ready';
      event: KitchenEvent;
      recipes: Map<string, Recipe>;
      loadedFromSnapshot: boolean;
    };

type WorkflowStatus =
  | { kind: 'idle' }            // initial — before we know what to do
  | { kind: 'needs-key' }       // event ready, no snapshot, no API key
  | { kind: 'generating' }
  | { kind: 'error'; message: string }
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
): DndMilestone[] {
  const dishById = new Map(dishes.map((d) => [d.id, d]));
  const byPhase = new Map<SchedulePhase, ScheduledStep[]>();
  for (const phase of PHASE_ORDER) byPhase.set(phase, []);
  for (const step of steps) {
    if (!byPhase.has(step.phase)) byPhase.set(step.phase, []);
    byPhase.get(step.phase)!.push(step);
  }
  const milestones: DndMilestone[] = [];
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
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>({ kind: 'idle' });
  const [scheduled, setScheduled] = useState<ScheduledStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [chefFilter, setChefFilter] = useState<ColorTag | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Forces the DnD builder to remount on Regenerate.
  const [generation, setGeneration] = useState(0);
  // AbortController for in-flight LLM calls (so Regenerate can cancel).
  const inflight = useRef<AbortController | null>(null);

  const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
  const model = useLlmSettingsStore((s) => s.model);
  // Env var (chefflow/.env.local, gitignored) acts as a fallback when the user
  // hasn't pasted a key into the settings sheet. Keeps a single source of truth
  // at the consumer level — the store stays purely user-managed state.
  const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
  const apiKey = (storedApiKey || envApiKey).trim();
  const isReady = apiKey.length > 0;

  // -------------------------------------------------------------------------
  // Initial load: pull event + recipes, decide whether to use the saved
  // snapshot or call the LLM.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    Promise.all([getEvent(eventId), listRecipes()]).then(([event, recipes]) => {
      if (cancelled) return;
      if (!event) {
        setState({ kind: 'not-found' });
        return;
      }
      const recipesMap = new Map(recipes.map((r) => [r.id, r]));
      setChefFilter(null);

      if (event.workflow && event.workflow.length > 0) {
        // Saved snapshot — skip the LLM entirely.
        setScheduled(event.workflow);
        setDirty(false);
        setWorkflowStatus({ kind: 'ready' });
        setState({ kind: 'ready', event, recipes: recipesMap, loadedFromSnapshot: true });
        return;
      }

      // No snapshot — need to generate. Gate on API key.
      setState({ kind: 'ready', event, recipes: recipesMap, loadedFromSnapshot: false });
      if (!isReady) {
        setWorkflowStatus({ kind: 'needs-key' });
        return;
      }
      void runLlm(event, recipesMap);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // -------------------------------------------------------------------------
  // runLlm — call the LLM, set scheduled state, surface errors.
  // -------------------------------------------------------------------------
  async function runLlm(event: KitchenEvent, recipes: Map<string, Recipe>) {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;

    setWorkflowStatus({ kind: 'generating' });
    try {
      const { steps } = await scheduleEventLLM({
        event,
        recipes,
        apiKey,
        model,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setScheduled(steps);
      setDirty(false);
      setWorkflowStatus({ kind: 'ready' });
    } catch (err) {
      if (controller.signal.aborted) return;
      setWorkflowStatus({ kind: 'error', message: friendlyError(err) });
    }
  }

  const scheduledById = useMemo(
    () => new Map(scheduled.map((s) => [s.id, s])),
    [scheduled],
  );

  if (state.kind === 'loading') return <div className="p-6 text-slate-500">Loading…</div>;
  if (state.kind === 'not-found') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Event not found.</h1>
        <Link to="/workflows" className="btn-secondary mt-4 inline-flex">
          Back to workflows
        </Link>
      </div>
    );
  }

  const { event, recipes, loadedFromSnapshot } = state;
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
  const milestones = scheduledStepsToMilestones(visibleSteps, event.dishes);

  function handleBuilderChange(nextMilestones: DndMilestone[]) {
    const next = milestonesToScheduledSteps(nextMilestones, scheduledById, serveAt);
    setScheduled(next);
    setDirty(true);
  }

  async function handleSave() {
    const updated: KitchenEvent = {
      ...event,
      workflow: scheduled,
      workflowDishesHash: currentDishesHash,
      updatedAt: Date.now(),
    };
    await saveEvent(updated);
    setDirty(false);
    setState({ kind: 'ready', event: updated, recipes, loadedFromSnapshot: true });
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
    setState({ kind: 'ready', event: cleared, recipes, loadedFromSnapshot: false });
    setGeneration((g) => g + 1);
    await runLlm(cleared, recipes);
  }

  const filteredChef = chefFilter ? chefGroups.find((g) => g.color === chefFilter) : null;
  const showWorkflowBody = workflowStatus.kind === 'ready' && scheduled.length > 0;

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link to="/workflows" className="btn-secondary text-sm inline-flex items-center gap-1 w-fit">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Workflows
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-6 bg-white dark:bg-kitchen-ink">
        <h1 className="text-3xl font-bold">{event.title || 'Untitled event'}</h1>
        <div className="mt-3 flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Calendar className="h-4 w-4" aria-hidden="true" />
          <span>{formatDateTime(event.serveAt)}</span>
        </div>
        {event.notes && (
          <div className="mt-4 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
            <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <p className="whitespace-pre-wrap">{event.notes}</p>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            Workflow
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={workflowStatus.kind === 'generating'}
              className="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Discard saved snapshot and re-run the LLM"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${workflowStatus.kind === 'generating' ? 'animate-spin' : ''}`} aria-hidden="true" />
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={(!dirty && loadedFromSnapshot) || !showWorkflowBody}
              className="btn-primary text-sm inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Persist the current workflow on this event"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Save
            </button>
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
            Asking {model} to build your workflow…
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
                onClick={() => void handleRegenerate()}
                className="btn-secondary text-xs mt-2 inline-flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Retry
              </button>
            </div>
          </div>
        )}

        {isStale && workflowStatus.kind === 'ready' && (
          <div
            role="status"
            className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200"
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

        {showWorkflowBody && hasDishes && chefGroups.length === 0 && (
          <p className="text-xs text-slate-500 italic mb-3">
            Assign a color to each dish in the Events tab to enable per-chef filtering.
          </p>
        )}

        {/* ----- Chef filter bar ----- */}
        {showWorkflowBody && hasDishes && chefGroups.length > 0 && (
          <div className="mb-3">
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

        {/* ----- Workflow body ----- */}
        {showWorkflowBody && (
          chefFilter && filteredChef ? (
            <PerChefReadOnlyList steps={visibleSteps} chefGroup={filteredChef} />
          ) : (
            <NestedDragDropBuilder
              key={`${event.id}-${generation}`}
              initialMilestones={milestones}
              onChange={handleBuilderChange}
              allowAddMilestone={false}
              allowAddStep={false}
              allowColorPicker={false}
              allowStepDrag={false}
            />
          )
        )}
      </div>

      <LlmSettingsSheet
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          // If user just provided a key while we were stuck on needs-key, kick off the LLM.
          if (workflowStatus.kind === 'needs-key' && useLlmSettingsStore.getState().isReady()) {
            void runLlm(event, recipes);
          }
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// PerChefReadOnlyList — same as before, untouched.
// ---------------------------------------------------------------------------
function PerChefReadOnlyList({
  steps,
  chefGroup,
}: {
  steps: ScheduledStep[];
  chefGroup: ChefGroup;
}) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">
        No steps for this chef. (No dishes match this color, or no recipes are linked.)
      </p>
    );
  }
  const sorted = steps
    .slice()
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
        <span className={`h-4 w-4 rounded-full ${swatchClassFor(chefGroup.color)}`} />
        <h3 className="font-semibold">{capitalize(chefGroup.color)} tasks</h3>
        <span className="ml-auto text-xs text-slate-500">
          {sorted.length} step{sorted.length === 1 ? '' : 's'}
        </span>
      </header>
      <ol className="divide-y divide-slate-100 dark:divide-slate-800">
        {sorted.map((s) => (
          <li key={s.id} className="flex gap-3 px-4 py-3">
            <span className="w-12 shrink-0 text-xs font-mono text-slate-500 pt-0.5">
              {formatClockTime(s.startAt)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm">{s.text}</p>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {s.dishLabel}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {Math.round(s.durationSec / 60)} min
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
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
