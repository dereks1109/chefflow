import { useEffect, useState } from 'react';
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
import { GripVertical, Plus, Trash2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DndStepMeta {
  /** Clock time (e.g. "17:48") shown in a monospace pill. */
  time?: string;
  /** Dish label (e.g. "Ribeye") shown as a small tag. */
  dish?: string;
  /** CulinaryRule.md rule numbers that drove this step's placement (e.g. [1, 5]). */
  rules?: number[];
}

export interface DndStep {
  id: string;
  content: string;
  /**
   * Optional metadata rendered as a sub-line under the step input. Used by the
   * Workflow page to display computed clock times + dish + rule pills next to
   * each scheduled step. The generic /demo/nested-dnd page leaves this off and
   * gets the plain editable-row UI.
   */
  meta?: DndStepMeta;
}

export interface DndMilestone {
  id: string;
  title: string;
  steps: DndStep[];
}

interface Props {
  initialMilestones: DndMilestone[];
  onChange?: (milestones: DndMilestone[]) => void;
}

// Two drop types so milestones can only land in the milestone column and
// steps can only land in step lists.
const TYPE_MILESTONE = 'MILESTONE';
const TYPE_STEP = 'STEP';

// ---------------------------------------------------------------------------
// id helpers — simple, collision-resistant within a session.
// ---------------------------------------------------------------------------
function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ===========================================================================
// Component
// ===========================================================================

export default function NestedDragDropBuilder({ initialMilestones, onChange }: Props) {
  const [milestones, setMilestones] = useState<DndMilestone[]>(initialMilestones);

  // Hydration guard. In Next.js (App Router) the drag-and-drop libraries can
  // mismatch between server-rendered and client-rendered HTML, so we render
  // a placeholder until the first effect runs on the client. Vite doesn't SSR
  // by default so this is a no-op for us, but keeping it here makes the
  // component portable to a Next.js host without changes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  function commit(next: DndMilestone[]) {
    setMilestones(next);
    onChange?.(next);
  }

  // -------------------------------------------------------------------------
  // The single onDragEnd handler. It receives every drop event the
  // DragDropContext emits. The shape we get back is:
  //
  //   { type, source: { droppableId, index }, destination?: { droppableId, index } }
  //
  // A null destination means the user dropped outside any valid Droppable —
  // treat it as a no-op. We also short-circuit identity drops (same list,
  // same index) so React doesn't re-render for nothing.
  // -------------------------------------------------------------------------
  function handleDragEnd(result: DropResult) {
    const { source, destination, type } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // ----- Milestone drag: reorder the top-level list -----
    if (type === TYPE_MILESTONE) {
      const next = Array.from(milestones);
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      commit(next);
      return;
    }

    // ----- Step drag: two cases — same milestone (reorder) or cross (move) -----
    if (type === TYPE_STEP) {
      const sourceMilestoneIdx = milestones.findIndex((m) => m.id === source.droppableId);
      const destMilestoneIdx = milestones.findIndex((m) => m.id === destination.droppableId);
      if (sourceMilestoneIdx === -1 || destMilestoneIdx === -1) return;

      const sourceMilestone = milestones[sourceMilestoneIdx];
      const destMilestone = milestones[destMilestoneIdx];

      // Intra-list: clone, splice out, splice back in.
      if (source.droppableId === destination.droppableId) {
        const nextSteps = Array.from(sourceMilestone.steps);
        const [moved] = nextSteps.splice(source.index, 1);
        nextSteps.splice(destination.index, 0, moved);
        const next = milestones.slice();
        next[sourceMilestoneIdx] = { ...sourceMilestone, steps: nextSteps };
        commit(next);
        return;
      }

      // Inter-list: pop from source's steps, push into dest's steps.
      const sourceSteps = Array.from(sourceMilestone.steps);
      const [moved] = sourceSteps.splice(source.index, 1);
      const destSteps = Array.from(destMilestone.steps);
      destSteps.splice(destination.index, 0, moved);
      const next = milestones.slice();
      next[sourceMilestoneIdx] = { ...sourceMilestone, steps: sourceSteps };
      next[destMilestoneIdx] = { ...destMilestone, steps: destSteps };
      commit(next);
    }
  }

  // -------------------------------------------------------------------------
  // Mutations (add / delete / rename) — kept separate from drag mechanics.
  // -------------------------------------------------------------------------
  function addMilestone() {
    commit([
      ...milestones,
      { id: newId('milestone'), title: 'New milestone', steps: [] },
    ]);
  }

  function removeMilestone(milestoneId: string) {
    commit(milestones.filter((m) => m.id !== milestoneId));
  }

  function renameMilestone(milestoneId: string, title: string) {
    commit(milestones.map((m) => (m.id === milestoneId ? { ...m, title } : m)));
  }

  function addStep(milestoneId: string) {
    commit(
      milestones.map((m) =>
        m.id === milestoneId
          ? { ...m, steps: [...m.steps, { id: newId('step'), content: '' }] }
          : m
      )
    );
  }

  function removeStep(milestoneId: string, stepId: string) {
    commit(
      milestones.map((m) =>
        m.id === milestoneId ? { ...m, steps: m.steps.filter((s) => s.id !== stepId) } : m
      )
    );
  }

  function editStep(milestoneId: string, stepId: string, content: string) {
    commit(
      milestones.map((m) =>
        m.id === milestoneId
          ? { ...m, steps: m.steps.map((s) => (s.id === stepId ? { ...s, content } : s)) }
          : m
      )
    );
  }

  // SSR placeholder — see the comment on `mounted` above.
  if (!mounted) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {milestones.map((m) => (
          <div key={m.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
            <div className="h-5 w-1/3 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="all-milestones" type={TYPE_MILESTONE} direction="vertical">
        {(provided: DroppableProvided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
            {milestones.map((milestone, milestoneIndex) => (
              <Draggable
                key={milestone.id}
                draggableId={milestone.id}
                index={milestoneIndex}
              >
                {(dragProvided: DraggableProvided, dragSnapshot: DraggableStateSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className={[
                      'rounded-lg border bg-white dark:bg-kitchen-ink overflow-hidden',
                      dragSnapshot.isDragging
                        ? 'border-accent shadow-lg ring-1 ring-accent/30'
                        : 'border-slate-200 dark:border-slate-700',
                    ].join(' ')}
                  >
                    <MilestoneHeader
                      milestone={milestone}
                      dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                      onRename={(title) => renameMilestone(milestone.id, title)}
                      onDelete={() => removeMilestone(milestone.id)}
                    />

                    {/* Nested Droppable for steps. type={STEP} restricts this list
                        to only accept Step Draggables — milestones won't land here. */}
                    <Droppable droppableId={milestone.id} type={TYPE_STEP}>
                      {(stepsProvided: DroppableProvided, stepsSnapshot: DroppableStateSnapshot) => (
                        <ul
                          ref={stepsProvided.innerRef}
                          {...stepsProvided.droppableProps}
                          className={[
                            'px-3 pb-3 pt-1 space-y-2 transition-colors',
                            // Visual feedback when a step is hovering over THIS milestone
                            stepsSnapshot.isDraggingOver
                              ? 'bg-accent/5'
                              : 'bg-transparent',
                            // Empty-state nudge so users see the drop target
                            milestone.steps.length === 0
                              ? 'min-h-[3rem]'
                              : '',
                          ].join(' ')}
                        >
                          {milestone.steps.map((step, stepIndex) => (
                            <Draggable
                              key={step.id}
                              draggableId={step.id}
                              index={stepIndex}
                            >
                              {(sp: DraggableProvided, ss: DraggableStateSnapshot) => (
                                <li
                                  ref={sp.innerRef}
                                  {...sp.draggableProps}
                                  className={[
                                    'rounded-md border bg-slate-50 dark:bg-slate-900 px-2 py-2',
                                    ss.isDragging
                                      ? 'border-accent shadow-md ring-1 ring-accent/30'
                                      : 'border-slate-200 dark:border-slate-700',
                                  ].join(' ')}
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      {...sp.dragHandleProps}
                                      className="touch-target px-1 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing"
                                      aria-label="Drag step"
                                    >
                                      <GripVertical className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <input
                                      type="text"
                                      value={step.content}
                                      onChange={(e) => editStep(milestone.id, step.id, e.target.value)}
                                      placeholder="Step description…"
                                      className="flex-1 bg-transparent text-sm outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1"
                                      aria-label="Step content"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeStep(milestone.id, step.id)}
                                      className="touch-target px-2 text-slate-400 hover:text-danger rounded"
                                      aria-label="Delete step"
                                    >
                                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                  </div>
                                  {step.meta && <StepMetaLine meta={step.meta} />}
                                </li>
                              )}
                            </Draggable>
                          ))}
                          {stepsProvided.placeholder}

                          <li>
                            <button
                              type="button"
                              onClick={() => addStep(milestone.id)}
                              className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:text-accent border border-dashed border-slate-300 dark:border-slate-700 rounded-md hover:border-accent transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                              Add step
                            </button>
                          </li>
                        </ul>
                      )}
                    </Droppable>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            <button
              type="button"
              onClick={addMilestone}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-slate-500 hover:text-accent border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-accent rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add milestone
            </button>
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Milestone header. Split out so the JSX above stays scannable.
// ---------------------------------------------------------------------------
function MilestoneHeader({
  milestone,
  dragHandleProps,
  onRename,
  onDelete,
}: {
  milestone: DndMilestone;
  dragHandleProps: DraggableProvided['dragHandleProps'] | undefined;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
      <span
        {...dragHandleProps}
        className="touch-target px-1 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing"
        aria-label="Drag milestone"
      >
        <GripVertical className="h-5 w-5" aria-hidden="true" />
      </span>
      <input
        type="text"
        value={milestone.title}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Milestone title…"
        className="flex-1 bg-transparent font-semibold text-base outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1"
        aria-label="Milestone title"
      />
      <button
        type="button"
        onClick={onDelete}
        className="touch-target px-2 text-slate-400 hover:text-danger rounded"
        aria-label="Delete milestone"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: optional metadata line rendered under a step's main row.
// Only shown when DndStep.meta is provided (Workflow page populates it; the
// generic recipe builder leaves it off).
// ---------------------------------------------------------------------------
function StepMetaLine({ meta }: { meta: DndStepMeta }) {
  if (!meta.time && !meta.dish && !(meta.rules && meta.rules.length > 0)) return null;
  return (
    <div className="mt-1 pl-9 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      {meta.time && (
        <span className="font-mono text-slate-700 dark:text-slate-300">{meta.time}</span>
      )}
      {meta.dish && (
        <span className="rounded px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
          {meta.dish}
        </span>
      )}
      {meta.rules && meta.rules.map((n) => (
        <span
          key={n}
          className="rounded px-1.5 py-0.5 bg-accent/10 text-accent text-[10px] font-medium"
          title={`CulinaryRule.md — Rule ${n}`}
        >
          R{n}
        </span>
      ))}
    </div>
  );
}
