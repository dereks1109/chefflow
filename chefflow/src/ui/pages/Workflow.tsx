import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Calendar, Check, Compass, RefreshCw, StickyNote } from 'lucide-react';
import NestedDragDropBuilder, {
  type DndMilestone,
} from '../components/NestedDragDropBuilder';
import { getEvent, saveEvent } from '../../db/eventsRepo';
import { listRecipes } from '../../db/recipesRepo';
import { formatDateTime } from '../../core/util/datetime';
import { scheduleEvent } from '../../core/scheduler/scheduleEvent';
import { hashDishes } from '../../core/scheduler/hash';
import type {
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
      /** Was the initial state from a saved snapshot vs a fresh algorithm run? */
      loadedFromSnapshot: boolean;
    };

// ---------------------------------------------------------------------------
// Adapter: ScheduledStep[] -> DndMilestone[] (display)
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

export function scheduledStepsToMilestones(steps: ScheduledStep[]): DndMilestone[] {
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
          rules: s.rulesApplied,
          colorTag: s.colorTag,
        },
      })),
    });
  }
  return milestones;
}

// ---------------------------------------------------------------------------
// Reverse direction: DndMilestone[] -> ScheduledStep[], chaining times so the
// last step in display order ends exactly at serveAt and each prior step ends
// where the next begins. The user's manual order becomes the canonical order;
// step phase is inferred from the milestone the step now sits in.
// ---------------------------------------------------------------------------
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
        colorTag: dndStep.meta?.colorTag,
      });
    }
  }
  if (ordered.length === 0) return ordered;

  // Reverse-chain clock times from serveAt.
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Workflow() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [scheduled, setScheduled] = useState<ScheduledStep[]>([]);
  const [dirty, setDirty] = useState(false);
  // Forces the DnD builder to remount when we Regenerate (so it picks up
  // the fresh initialMilestones).
  const [generation, setGeneration] = useState(0);

  // Load event + recipes; decide initial scheduled state from snapshot or
  // fresh algorithm run. Runs once per eventId — Regenerate updates state
  // synchronously below rather than re-triggering this effect.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getEvent(eventId), listRecipes()]).then(([event, recipes]) => {
      if (cancelled) return;
      if (!event) {
        setState({ kind: 'not-found' });
        return;
      }
      const recipesMap = new Map(recipes.map((r) => [r.id, r]));
      let initial: ScheduledStep[];
      let loadedFromSnapshot = false;
      if (event.workflow && event.workflow.length > 0) {
        initial = event.workflow;
        loadedFromSnapshot = true;
      } else {
        initial = scheduleEvent({ event, recipes: recipesMap });
      }
      setScheduled(initial);
      setDirty(false);
      setState({ kind: 'ready', event, recipes: recipesMap, loadedFromSnapshot });
    });
    return () => { cancelled = true; };
  }, [eventId]);

  // Index by id for fast reverse mapping when the DnD builder emits onChange.
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
  const milestones = scheduledStepsToMilestones(scheduled);
  const hasDishes = event.dishes.length > 0;
  const serveAt = event.serveAt ? new Date(event.serveAt) : new Date();
  const currentDishesHash = hashDishes(event.dishes);
  const isStale =
    loadedFromSnapshot &&
    !!event.workflowDishesHash &&
    event.workflowDishesHash !== currentDishesHash;

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
      !window.confirm('Regenerate from rules? Unsaved reorder/colors will be discarded.')
    ) return;
    const cleared: KitchenEvent = {
      ...event,
      workflow: undefined,
      workflowDishesHash: undefined,
      updatedAt: Date.now(),
    };
    await saveEvent(cleared);
    // Re-run the algorithm in-place so the new scheduled state and the
    // builder remount happen in the same React commit. Bumping generation
    // changes the builder's key so it picks up the new initialMilestones.
    const fresh = scheduleEvent({ event: cleared, recipes });
    setScheduled(fresh);
    setDirty(false);
    setState({ kind: 'ready', event: cleared, recipes, loadedFromSnapshot: false });
    setGeneration((g) => g + 1);
  }

  // Count colors so the user has a hint at-a-glance.
  const colorCounts = scheduled.reduce<Record<string, number>>((acc, s) => {
    if (s.colorTag) acc[s.colorTag] = (acc[s.colorTag] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <Link to="/workflows" className="btn-secondary text-sm inline-flex items-center gap-1 w-fit">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Workflows
      </Link>

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
              className="btn-secondary text-sm inline-flex items-center gap-1"
              title="Discard saved snapshot and re-run the algorithm"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!dirty && loadedFromSnapshot}
              className="btn-primary text-sm inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Persist the current workflow on this event"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Save
            </button>
          </div>
        </div>

        {isStale && (
          <div
            role="status"
            className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              Dishes have changed since this workflow was saved. Click <strong>Regenerate</strong> to rebuild it from the
              current dishes, or keep your saved order and edits and ignore the new dishes.
            </p>
          </div>
        )}

        {!hasDishes && (
          <p className="text-sm text-slate-500 italic mb-3">
            This event has no dishes yet — add some in the Events tab and the workflow will populate automatically.
          </p>
        )}
        {hasDishes && milestones.length === 0 && (
          <p className="text-sm text-slate-500 italic mb-3">
            No schedulable steps. Make sure each dish is linked to a recipe (or marked "I'll get the dish ready") in the editor.
          </p>
        )}

        {Object.keys(colorCounts).length > 0 && (
          <p className="text-xs text-slate-500 mb-3" aria-label="Color summary">
            {Object.entries(colorCounts)
              .map(([color, count]) => `${count} ${color}`)
              .join(' · ')}
          </p>
        )}

        {/* Remount when the underlying generation changes (Regenerate) or
            when the event itself changes (eventId switch). */}
        <NestedDragDropBuilder
          key={`${event.id}-${generation}`}
          initialMilestones={milestones}
          onChange={handleBuilderChange}
          allowAddMilestone={false}
          allowAddStep={false}
        />
      </div>
    </section>
  );
}

// Re-export for tests.
export { hashDishes } from '../../core/scheduler/hash';
