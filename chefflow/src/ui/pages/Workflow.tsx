import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Compass, StickyNote } from 'lucide-react';
import NestedDragDropBuilder, {
  type DndMilestone,
} from '../components/NestedDragDropBuilder';
import { getEvent } from '../../db/eventsRepo';
import { listRecipes } from '../../db/recipesRepo';
import { formatDateTime } from '../../core/util/datetime';
import { scheduleEvent } from '../../core/scheduler/scheduleEvent';
import type { KitchenEvent, Recipe, ScheduledStep, SchedulePhase } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; event: KitchenEvent; recipes: Map<string, Recipe> };

// ---------------------------------------------------------------------------
// Adapter: scheduler output (flat ScheduledStep[]) -> DnD shape (milestones).
// Groups steps by phase in a fixed chef-friendly order so the chef sees a
// Prep block, optionally a Sanitize block, then Cook, then Serve. Times are
// computed from the steps' actual start/end, so an "empty" phase is silently
// skipped.
// ---------------------------------------------------------------------------
const PHASE_ORDER: SchedulePhase[] = ['prep', 'sanitize', 'cook', 'serve'];
const PHASE_LABEL: Record<SchedulePhase, string> = {
  prep: 'Prep',
  sanitize: 'Sanitize',
  cook: 'Cook',
  serve: 'Serve',
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
        },
      })),
    });
  }
  return milestones;
}

// ===========================================================================
// Page
// ===========================================================================

export default function Workflow() {
  const { eventId = '' } = useParams<{ eventId: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getEvent(eventId), listRecipes()]).then(([event, recipes]) => {
      if (cancelled) return;
      if (!event) {
        setState({ kind: 'not-found' });
        return;
      }
      const recipesMap = new Map(recipes.map((r) => [r.id, r]));
      setState({ kind: 'ready', event, recipes: recipesMap });
    });
    return () => { cancelled = true; };
  }, [eventId]);

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

  const { event, recipes } = state;
  const scheduled = scheduleEvent({ event, recipes });
  const milestones = scheduledStepsToMilestones(scheduled);
  const hasDishes = event.dishes.length > 0;

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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-2">
          <Compass className="h-3.5 w-3.5" aria-hidden="true" />
          Workflow
        </h2>
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
        <p className="text-xs text-slate-500 mb-3">
          Generated from the event's dishes via the rule-driven scheduler. Times are reverse-engineered from the serve
          moment. Edits and drags are local-only for now — they won't persist across navigation until Task C lands.
        </p>
        {/* Pass eventId as the key so swapping events fully resets the DnD state. */}
        <NestedDragDropBuilder key={event.id} initialMilestones={milestones} />
      </div>
    </section>
  );
}
