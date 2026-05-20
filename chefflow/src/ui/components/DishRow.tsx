import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronUp, Clock, Edit3, Hand, Trash2, Users, Wallet } from 'lucide-react';
import type { ColorTag, Dish } from '../../core/types';
import { formatTime, toLocalInputValue, fromLocalInputValue } from '../../core/util/datetime';
import { formatGBP } from '../../core/util/money';
import ColorPicker from './ColorPicker';
import NotesList from './NotesList';

interface Props {
  index: number;
  value: Dish;
  reorderMode?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onColorChange?: (color: ColorTag | undefined) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /**
   * Inline edit hook for the dish start-time. When provided, the clock text
   * becomes a button that swaps to a `<datetime-local>` input on click;
   * commit on blur/Enter, cancel on Esc. Omit to keep the time read-only —
   * callers in non-editable contexts (timelines, summaries) don't pass it.
   */
  onTimeChange?: (nextIsoStartAt: string) => void;
  /**
   * Inline edit hook for the dish name. When provided, the title text swaps
   * to a `<input type="text">` on click; commit on blur/Enter (only when
   * non-empty), cancel on Esc. Mirrors the time-edit pattern, including the
   * DnD stopPropagation guards.
   */
  onNameChange?: (next: string) => void;
  /**
   * Inline edit hook for portions. Click the "N portion(s)" text to swap to
   * a `<input type="number" min={1}>`. Values <= 1 clamp to 1 on commit;
   * non-finite input cancels (keeps current value). Commit on blur/Enter,
   * cancel on Esc.
   */
  onPortionsChange?: (next: number) => void;
  /**
   * Inline edit hook for notes. When notes exist, clicking the paragraph
   * swaps to an auto-sizing `<textarea>`. Commit on Enter (Shift+Enter adds
   * a newline), or on blur. Esc cancels. Saving an empty value passes ''
   * — callers decide whether to treat that as "clear notes" (typically by
   * normalising '' → undefined before persisting).
   */
  onNotesChange?: (next: string) => void;
  /**
   * Price per portion in GBP, looked up by the caller from the linked
   * recipe. When set, the row displays `£X.XX/portion` and a derived
   * `£Y total` (portions × pricePerPortion). When undefined, both cells
   * are omitted unless `onPricePerPortionChange` is also provided — in
   * which case an "+ Add price" affordance is shown.
   */
  pricePerPortion?: number;
  /**
   * Inline edit hook for price per portion. Mutates the LINKED RECIPE,
   * not the dish — there is no dish-level price field. Pass `undefined`
   * on commit to clear the recipe's price. Callers should warn the user
   * (via a tooltip on the cell) that the change applies to every event
   * using that recipe. Omit when the dish has no linked recipe to edit.
   */
  onPricePerPortionChange?: (next: number | undefined) => void;
}

export default function DishRow({
  index,
  value,
  reorderMode,
  canMoveUp,
  canMoveDown,
  onEdit,
  onRemove,
  onColorChange,
  onMoveUp,
  onMoveDown,
  onTimeChange,
  onNameChange,
  onPortionsChange,
  onNotesChange,
  pricePerPortion,
  onPricePerPortionChange,
}: Props) {
  // Each inline-edit mode is independent so opening one doesn't disrupt the
  // others. They share the same stop-propagation guards to keep @hello-pangea/dnd
  // from picking up drags while the user is typing.
  const [editingTime, setEditingTime] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingPortions, setEditingPortions] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);

  const timeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const portionsInputRef = useRef<HTMLInputElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTime) timeInputRef.current?.focus();
  }, [editingTime]);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  useEffect(() => {
    if (editingPortions) {
      portionsInputRef.current?.focus();
      portionsInputRef.current?.select();
    }
  }, [editingPortions]);

  useEffect(() => {
    if (editingNotes) {
      const ta = notesTextareaRef.current;
      if (ta) {
        ta.focus();
        // Place cursor at end and auto-size to content height.
        ta.selectionStart = ta.value.length;
        ta.selectionEnd = ta.value.length;
        autosize(ta);
      }
    }
  }, [editingNotes]);

  useEffect(() => {
    if (editingPrice) {
      priceInputRef.current?.focus();
      priceInputRef.current?.select();
    }
  }, [editingPrice]);

  function commitTime(raw: string) {
    if (!onTimeChange) {
      setEditingTime(false);
      return;
    }
    const next = fromLocalInputValue(raw);
    if (next && next !== value.startAt) onTimeChange(next);
    setEditingTime(false);
  }

  function commitName(raw: string) {
    if (!onNameChange) {
      setEditingName(false);
      return;
    }
    const trimmed = raw.trim();
    // Only persist when the value actually changed AND is non-empty —
    // an empty name would render "Untitled dish" and is almost never
    // intentional, so we drop the commit instead.
    if (trimmed.length > 0 && trimmed !== value.name) onNameChange(trimmed);
    setEditingName(false);
  }

  function commitPortions(raw: string) {
    if (!onPortionsChange) {
      setEditingPortions(false);
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const clamped = Math.max(1, Math.floor(n));
      if (clamped !== value.portions) onPortionsChange(clamped);
    }
    setEditingPortions(false);
  }

  function commitNotes(raw: string) {
    if (!onNotesChange) {
      setEditingNotes(false);
      return;
    }
    if (raw !== (value.notes ?? '')) onNotesChange(raw);
    setEditingNotes(false);
  }

  function commitPrice(raw: string) {
    if (!onPricePerPortionChange) {
      setEditingPrice(false);
      return;
    }
    const trimmed = raw.trim();
    // Empty string clears the price (recipe.pricePerPortion → undefined).
    if (trimmed.length === 0) {
      if (pricePerPortion !== undefined) onPricePerPortionChange(undefined);
      setEditingPrice(false);
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0 && n !== pricePerPortion) {
      onPricePerPortionChange(n);
    }
    setEditingPrice(false);
  }

  return (
    <li
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-3"
      data-testid="dish-row"
      data-dish-id={value.id}
    >
      <div className="flex items-start gap-3">
        <span className="text-xs font-semibold text-slate-500 w-6 pt-1">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          {/* Single-row layout: time · name (+ recipe link / ready badge) ·
              portions · £/portion · £ total. Notes ride on the row below. */}
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-slate-600 dark:text-slate-400">
            {/* Time — HH:MM display, datetime-local editor (dish can fall
                on a different day from the event's serveAt). */}
            <div className="inline-flex items-center gap-1 font-mono">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {editingTime && onTimeChange ? (
                <input
                  ref={timeInputRef}
                  type="datetime-local"
                  defaultValue={toLocalInputValue(value.startAt)}
                  onBlur={(e) => commitTime(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitTime(e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingTime(false);
                    }
                    // Block keys propagating to DnD's keyboard sensors.
                    e.stopPropagation();
                  }}
                  // Stop the drag sensor picking up clicks/drags inside the input.
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="text-xs bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-accent focus:outline-none px-1 py-0.5"
                  aria-label={`Start time for dish ${index + 1}`}
                />
              ) : onTimeChange ? (
                <button
                  type="button"
                  onClick={() => setEditingTime(true)}
                  className="hover:text-accent hover:underline focus:outline-none focus:underline"
                  aria-label={`Edit start time for dish ${index + 1}`}
                  title="Click to edit start time"
                >
                  {formatTime(value.startAt)}
                </button>
              ) : (
                <span>{formatTime(value.startAt)}</span>
              )}
            </div>

            {/* Name — promoted in size; recipe link + ready badge stay
                attached so they read as a single unit. */}
            <div className="inline-flex items-center gap-2 min-w-0">
              {editingName && onNameChange ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  defaultValue={value.name}
                  onBlur={(e) => commitName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitName(e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingName(false);
                    }
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100 bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-accent focus:outline-none px-1 py-0.5 min-w-0"
                  aria-label={`Dish ${index + 1} name`}
                  placeholder="Dish name"
                />
              ) : onNameChange ? (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100 text-left hover:text-accent hover:underline focus:outline-none focus:underline truncate"
                  aria-label={`Edit name for dish ${index + 1}`}
                  title="Click to edit dish name"
                >
                  {value.name || 'Untitled dish'}
                </button>
              ) : (
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {value.name || 'Untitled dish'}
                </h3>
              )}
              {value.recipeId && (
                <Link
                  to={`/recipes/${value.recipeId}/edit`}
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline shrink-0"
                >
                  <BookOpen className="h-3 w-3" aria-hidden="true" />
                  recipe
                </Link>
              )}
              {value.isPrepared && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500 shrink-0">
                  <Hand className="h-3 w-3" aria-hidden="true" />
                  ready
                </span>
              )}
            </div>

            {/* Portions — click to edit. */}
            <div className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden="true" />
              {editingPortions && onPortionsChange ? (
                <input
                  ref={portionsInputRef}
                  type="number"
                  min={1}
                  defaultValue={value.portions}
                  onBlur={(e) => commitPortions(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitPortions(e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingPortions(false);
                    }
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-16 text-xs bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-accent focus:outline-none px-1 py-0.5"
                  aria-label={`Portions for dish ${index + 1}`}
                />
              ) : onPortionsChange ? (
                <button
                  type="button"
                  onClick={() => setEditingPortions(true)}
                  className="hover:text-accent hover:underline focus:outline-none focus:underline"
                  aria-label={`Edit portions for dish ${index + 1}`}
                  title="Click to edit portions"
                >
                  {value.portions} portion{value.portions === 1 ? '' : 's'}
                </button>
              ) : (
                <span>{value.portions} portion{value.portions === 1 ? '' : 's'}</span>
              )}
            </div>

            {/* Price / portion — sourced from the linked recipe. Editable
                in place when onPricePerPortionChange is provided; writes back
                to the recipe (NOT a dish-level override), so the change
                propagates to every event using that recipe. */}
            {(pricePerPortion !== undefined || onPricePerPortionChange) && (
              <div
                className="inline-flex items-center gap-1"
                title={
                  onPricePerPortionChange
                    ? 'Edits the linked recipe — change applies to every event using it'
                    : 'Price per portion (from the linked recipe)'
                }
              >
                <Wallet className="h-3 w-3" aria-hidden="true" />
                {editingPrice && onPricePerPortionChange ? (
                  <input
                    ref={priceInputRef}
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={pricePerPortion ?? ''}
                    onBlur={(e) => commitPrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitPrice(e.currentTarget.value);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingPrice(false);
                      }
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="w-20 text-xs bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-accent focus:outline-none px-1 py-0.5"
                    aria-label={`Price per portion for dish ${index + 1} (GBP)`}
                    placeholder="0.00"
                  />
                ) : onPricePerPortionChange ? (
                  <button
                    type="button"
                    onClick={() => setEditingPrice(true)}
                    className="hover:text-accent hover:underline focus:outline-none focus:underline"
                    aria-label={`Edit price per portion for dish ${index + 1}`}
                    title="Click to edit price per portion"
                  >
                    {pricePerPortion !== undefined
                      ? `${formatGBP(pricePerPortion)}/portion`
                      : '+ Add price'}
                  </button>
                ) : (
                  <span>{formatGBP(pricePerPortion as number)}/portion</span>
                )}
              </div>
            )}

            {/* Total — portions × pricePerPortion. Read-only (derived). */}
            {pricePerPortion !== undefined && (
              <div
                className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200"
                title="Portions × price per portion"
              >
                <span>{formatGBP(pricePerPortion * value.portions)} total</span>
              </div>
            )}
          </div>
          {/* Notes block:
              - editing → autosized textarea (Enter commits, Shift+Enter newline)
              - notes present + onNotesChange → clickable paragraph
              - notes present, no handler → plain paragraph (existing behavior)
              - no notes → render nothing (brief: don't force a "+ Add note") */}
          {editingNotes && onNotesChange ? (
            <textarea
              ref={notesTextareaRef}
              defaultValue={value.notes ?? ''}
              onBlur={(e) => commitNotes(e.target.value)}
              onChange={(e) => autosize(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitNotes(e.currentTarget.value);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingNotes(false);
                }
                e.stopPropagation();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="mt-2 w-full text-sm bg-transparent border border-slate-300 dark:border-slate-600 rounded focus:border-accent focus:outline-none px-2 py-1 resize-none"
              rows={1}
              aria-label={`Notes for dish ${index + 1}`}
              placeholder="Notes (Enter to save, Shift+Enter for newline, Esc to cancel)"
            />
          ) : value.notes && onNotesChange ? (
            // Clickable region wrapping a NotesList — using <div role="button">
            // rather than <button> because <button> can't legally contain the
            // block-level <ul> NotesList renders for multi-line notes.
            <div
              role="button"
              tabIndex={0}
              onClick={() => setEditingNotes(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEditingNotes(true);
                }
              }}
              className="mt-2 text-sm text-slate-600 dark:text-slate-400 hover:text-accent focus:outline-none focus:text-accent cursor-text"
              aria-label={`Edit notes for dish ${index + 1}`}
              title="Click to edit notes"
            >
              <NotesList notes={value.notes} />
            </div>
          ) : value.notes ? (
            <NotesList
              notes={value.notes}
              className="mt-2 text-sm text-slate-600 dark:text-slate-400"
            />
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {reorderMode ? (
            <>
              <button
                type="button"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                className="touch-target px-2 rounded-md text-slate-500 hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={`Move dish ${index + 1} up`}
              >
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={!canMoveDown}
                className="touch-target px-2 rounded-md text-slate-500 hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={`Move dish ${index + 1} down`}
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              {onColorChange && (
                <ColorPicker
                  value={value.colorTag}
                  onChange={onColorChange}
                  label={`Color tag for dish ${index + 1}`}
                />
              )}
              <button
                type="button"
                onClick={onEdit}
                className="touch-target px-2 rounded-md text-slate-500 hover:text-accent"
                aria-label={`Edit dish ${index + 1}`}
                data-testid="dish-row-edit"
              >
                <Edit3 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="touch-target px-2 rounded-md text-slate-500 hover:text-danger"
                aria-label={`Remove dish ${index + 1}`}
                data-testid="dish-row-remove"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// Auto-size a textarea to its content. Resets height before measuring so the
// element shrinks as well as grows. Called on focus and on every change.
function autosize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
