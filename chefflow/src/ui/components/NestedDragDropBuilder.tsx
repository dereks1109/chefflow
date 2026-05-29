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
import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import ColorPicker, { swatchClassFor } from './ColorPicker';
import type { ColorTag } from '../../core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DndStepMeta {
  /** Clock time (e.g. "17:48") shown in a monospace pill. */
  time?: string;
  /** Dish label (e.g. "Ribeye") shown as a small tag. */
  dish?: string;
  /** Dish id — used by the workflow page to filter steps per chef-color. */
  dishId?: string;
  /** CulinaryRule.md rule numbers that drove this step's placement (e.g. [1, 5]). */
  rules?: number[];
  /** Color tag (sourced from the step's dish on the workflow page). */
  colorTag?: ColorTag;
  /** Multiple dish tags — used by the Order-list milestone where one
   *  ingredient row aggregates across several dishes. Each entry renders
   *  as a small slate chip. Mutually exclusive in practice with `dish`. */
  dishTags?: string[];
  /** Per-dish breakdown rows shown under the step's main row. Used by the
   *  Order-list milestone where one ingredient heading (e.g. "Black
   *  pepper") rolls up each dish's per-unit contribution: "10g for Salad
   *  / 5g for Lamb Rack / 10 tsp for Ribeye". Mutually exclusive in
   *  practice with `dishTags`. */
  breakdown?: { amount: number; unit: string; dishName: string }[];
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
  /**
   * When false, hides the "Add milestone" affordance at the column foot.
   * The workflow page sets this to false because milestones are derived
   * from phases (Prep / Cook / Serve / Sanitize) — chefs shouldn't be
   * inventing new ones in that view.
   */
  allowAddMilestone?: boolean;
  /**
   * When false, hides the "Add step" affordance inside each milestone.
   * Same rationale as allowAddMilestone for the workflow page.
   */
  allowAddStep?: boolean;
  /**
   * When false, hides the per-step ColorPicker. The workflow page sets
   * this to false because color now lives on the dish — the picker on
   * each step would be misleading. A small read-only swatch still shows
   * when `meta.colorTag` is present, so chefs see who owns each step.
   */
  allowColorPicker?: boolean;
  /**
   * When false, steps inside a milestone become non-draggable and the
   * grip is replaced with a tick-off checkbox (strikethrough when checked).
   * Milestones themselves stay drag-reorderable. Used by the workflow page
   * because the LLM owns step ordering — chefs check off what's done, not
   * shuffle the order.
   */
  allowStepDrag?: boolean;
  /**
   * When false, milestones themselves are NOT drag-reorderable. Instead the
   * grip handle is replaced with a chevron that collapses/expands the
   * milestone's step list. Used by the workflow page where the scheduler
   * owns milestone ordering — chefs collapse phases they're done with.
   */
  allowMilestoneDrag?: boolean;
  /**
   * When false, step text is rendered as a read-only paragraph (wrapping
   * to multiple lines for long content) instead of a single-line input.
   * Color picker + delete button are also hidden. Used by the workflow
   * page where step text is scheduler-owned, not user-edited.
   */
  allowStepEdit?: boolean;
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

export default function NestedDragDropBuilder({
  initialMilestones,
  onChange,
  allowAddMilestone = true,
  allowAddStep = true,
  allowColorPicker = true,
  allowStepDrag = true,
  allowMilestoneDrag = true,
  allowStepEdit = true,
}: Props) {
  const [milestones, setMilestones] = useState<DndMilestone[]>(initialMilestones);
  const [collapsedMilestoneIds, setCollapsedMilestoneIds] = useState<Set<string>>(new Set());

  function toggleMilestoneCollapsed(id: string) {
    setCollapsedMilestoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  // Tick-off state for non-draggable steps. Local-only — resets on remount
  // (e.g. after Regenerate or page reload). Persisting per-step "done" would
  // need a new field on ScheduledStep + a save path; out of scope here.
  const [checkedStepIds, setCheckedStepIds] = useState<Set<string>>(() => new Set());

  function toggleStepChecked(stepId: string) {
    setCheckedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

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

  function setStepColor(milestoneId: string, stepId: string, colorTag: ColorTag | undefined) {
    commit(
      milestones.map((m) =>
        m.id === milestoneId
          ? {
              ...m,
              steps: m.steps.map((s) =>
                s.id === stepId
                  ? { ...s, meta: { ...(s.meta ?? {}), colorTag } }
                  : s,
              ),
            }
          : m,
      ),
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
            {milestones.map((milestone, milestoneIndex) => {
              const collapsed = collapsedMilestoneIds.has(milestone.id);
              const renderCard = (
                dragProvided?: DraggableProvided,
                dragSnapshot?: DraggableStateSnapshot,
              ) => (
                <div
                  ref={dragProvided?.innerRef}
                  {...(dragProvided?.draggableProps ?? {})}
                  className={[
                    'rounded-lg border bg-white dark:bg-kitchen-ink overflow-hidden',
                    dragSnapshot?.isDragging
                      ? 'border-accent shadow-lg ring-1 ring-accent/30'
                      : 'border-slate-200 dark:border-slate-700',
                  ].join(' ')}
                >
                  <MilestoneHeader
                    milestone={milestone}
                    dragHandleProps={dragProvided?.dragHandleProps ?? undefined}
                    collapsed={allowMilestoneDrag ? undefined : collapsed}
                    onToggleCollapsed={allowMilestoneDrag ? undefined : () => toggleMilestoneCollapsed(milestone.id)}
                    onRename={(title) => renameMilestone(milestone.id, title)}
                    onDelete={() => removeMilestone(milestone.id)}
                  />

                  {/* Steps list. When the milestone is collapsed (expand/collapse
                      mode only), skip rendering entirely so the card shrinks. */}
                  {!collapsed && (
                    <Droppable droppableId={milestone.id} type={TYPE_STEP}>
                      {(stepsProvided: DroppableProvided, stepsSnapshot: DroppableStateSnapshot) => (
                        <ul
                          ref={stepsProvided.innerRef}
                          {...stepsProvided.droppableProps}
                          className={[
                            'px-3 pb-3 pt-1 space-y-1 transition-colors',
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
                          {milestone.steps.map((step, stepIndex) => {
                            const isChecked = checkedStepIds.has(step.id);
                            const stepBody = (leadingControl: ReactNode): ReactNode => (
                              <>
                                <div className="flex items-start gap-2">
                                  <span className="shrink-0 pt-0.5">{leadingControl}</span>
                                  {allowStepEdit ? (
                                    <input
                                      type="text"
                                      value={step.content}
                                      onChange={(e) => editStep(milestone.id, step.id, e.target.value)}
                                      placeholder="Step description…"
                                      className={[
                                        'flex-1 bg-transparent text-xs outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1',
                                        isChecked ? 'line-through text-slate-400 dark:text-slate-500' : '',
                                      ].join(' ')}
                                      aria-label="Step content"
                                    />
                                  ) : (
                                    <p
                                      className={[
                                        'flex-1 text-xs px-2 py-0.5 whitespace-pre-wrap break-words leading-snug',
                                        isChecked ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200',
                                      ].join(' ')}
                                    >
                                      {step.content}
                                    </p>
                                  )}
                                  {allowColorPicker ? (
                                    <ColorPicker
                                      value={step.meta?.colorTag}
                                      onChange={(c) => setStepColor(milestone.id, step.id, c)}
                                      label={`Color tag for step ${stepIndex + 1}`}
                                    />
                                  ) : step.meta?.colorTag ? (
                                    <span
                                      className={`h-3 w-3 rounded-full shrink-0 mt-1.5 ${swatchClassFor(step.meta.colorTag)}`}
                                      aria-label={`Color: ${step.meta.colorTag}`}
                                      title={`Color: ${step.meta.colorTag}`}
                                    />
                                  ) : null}
                                  {allowStepEdit && (
                                    <button
                                      type="button"
                                      onClick={() => removeStep(milestone.id, step.id)}
                                      className="touch-target px-2 text-slate-400 hover:text-danger rounded shrink-0"
                                      aria-label="Delete step"
                                    >
                                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                  )}
                                </div>
                                {step.meta && <StepMetaLine meta={step.meta} />}
                              </>
                            );

                            if (!allowStepDrag) {
                              return (
                                <li
                                  key={step.id}
                                  className={[
                                    'rounded-md border bg-slate-50 dark:bg-slate-900 px-2 py-1 border-slate-200 dark:border-slate-700',
                                    isChecked ? 'opacity-70' : '',
                                  ].join(' ')}
                                >
                                  {stepBody(
                                    <label
                                      className="touch-target px-1 inline-flex items-center cursor-pointer"
                                      aria-label={isChecked ? 'Mark step not done' : 'Mark step done'}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleStepChecked(step.id)}
                                        className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
                                      />
                                    </label>,
                                  )}
                                </li>
                              );
                            }

                            return (
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
                                      'rounded-md border bg-slate-50 dark:bg-slate-900 px-2 py-1',
                                      ss.isDragging
                                        ? 'border-accent shadow-md ring-1 ring-accent/30'
                                        : 'border-slate-200 dark:border-slate-700',
                                    ].join(' ')}
                                  >
                                    {stepBody(
                                      <span
                                        {...sp.dragHandleProps}
                                        className="touch-target px-1 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing"
                                        aria-label="Drag step"
                                      >
                                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                                      </span>,
                                    )}
                                  </li>
                                )}
                              </Draggable>
                            );
                          })}
                          {stepsProvided.placeholder}

                          {allowAddStep && (
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
                          )}
                        </ul>
                      )}
                    </Droppable>
                  )}
                </div>
              );

              if (!allowMilestoneDrag) {
                // Static (non-draggable) card. Outer Droppable still wraps it
                // but never receives a Draggable, so it stays inert.
                return <div key={milestone.id}>{renderCard()}</div>;
              }
              return (
                <Draggable
                  key={milestone.id}
                  draggableId={milestone.id}
                  index={milestoneIndex}
                >
                  {(dragProvided: DraggableProvided, dragSnapshot: DraggableStateSnapshot) =>
                    renderCard(dragProvided, dragSnapshot)
                  }
                </Draggable>
              );
            })}
            {provided.placeholder}

            {allowAddMilestone && (
              <button
                type="button"
                onClick={addMilestone}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-slate-500 hover:text-accent border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-accent rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add milestone
              </button>
            )}
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
  collapsed,
  onToggleCollapsed,
  onRename,
  onDelete,
}: {
  milestone: DndMilestone;
  dragHandleProps: DraggableProvided['dragHandleProps'] | undefined;
  /** When defined, renders an expand/collapse chevron INSTEAD of the drag handle. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const useExpander = onToggleCollapsed !== undefined;
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40"
      onClick={useExpander ? onToggleCollapsed : undefined}
      role={useExpander ? 'button' : undefined}
      aria-expanded={useExpander ? !collapsed : undefined}
    >
      {useExpander ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCollapsed?.(); }}
          className="touch-target px-1 text-slate-500 hover:text-accent"
          aria-label={collapsed ? `Expand ${milestone.title}` : `Collapse ${milestone.title}`}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" aria-hidden="true" /> : <ChevronDown className="h-5 w-5" aria-hidden="true" />}
        </button>
      ) : (
        <span
          {...dragHandleProps}
          className="touch-target px-1 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing"
          aria-label="Drag milestone"
        >
          <GripVertical className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <input
        type="text"
        value={milestone.title}
        onChange={(e) => onRename(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder="Milestone title…"
        className="flex-1 bg-transparent font-semibold text-base outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1"
        aria-label="Milestone title"
      />
      {useExpander && (
        <span className="text-xs text-slate-500 tabular-nums">
          {milestone.steps.length} step{milestone.steps.length === 1 ? '' : 's'}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
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
  const hasTags = Array.isArray(meta.dishTags) && meta.dishTags.length > 0;
  const hasBreakdown = Array.isArray(meta.breakdown) && meta.breakdown.length > 0;
  if (!meta.time && !meta.dish && !hasTags && !hasBreakdown) return null;
  return (
    <div className="mt-1 pl-9 text-xs text-slate-500">
      {(meta.time || meta.dish || hasTags) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {meta.time && (
            <span className="font-mono text-slate-700 dark:text-slate-300">{meta.time}</span>
          )}
          {meta.dish && (
            <span className="rounded px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {meta.dish}
            </span>
          )}
          {hasTags && meta.dishTags!.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="rounded px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {hasBreakdown && (
        <ul className="mt-0.5 space-y-0.5 text-slate-600 dark:text-slate-400">
          {meta.breakdown!.map((row, i) => (
            <li key={`${row.dishName}-${row.unit}-${i}`} data-testid="order-list-breakdown-row">
              {formatBreakdownAmount(row.amount, row.unit)} for {row.dishName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Trim trailing zeros (3.00 → 3, 1.5 stays 1.5). Mirrors the helper
 *  used by Workflow.tsx for ordered-list amounts; kept inline here so
 *  StepMetaLine has no cross-page import. */
function formatBreakdownAmount(amount: number, unit: string): string {
  const rounded = Number.isInteger(amount) ? amount : Number(amount.toFixed(2));
  const trimmed = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, '');
  return `${trimmed} ${unit}`.trim();
}
