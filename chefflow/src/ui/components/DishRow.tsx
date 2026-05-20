import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronUp, Clock, Edit3, Hand, Trash2, Users } from 'lucide-react';
import type { ColorTag, Dish } from '../../core/types';
import { formatDateTime, toLocalInputValue, fromLocalInputValue } from '../../core/util/datetime';
import ColorPicker from './ColorPicker';

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
}: Props) {
  // Each inline-edit mode is independent so opening one doesn't disrupt the
  // others. They share the same stop-propagation guards to keep @hello-pangea/dnd
  // from picking up drags while the user is typing.
  const [editingTime, setEditingTime] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingPortions, setEditingPortions] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const timeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const portionsInputRef = useRef<HTMLInputElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <li
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-3"
      data-testid="dish-row"
      data-dish-id={value.id}
    >
      <div className="flex items-start gap-3">
        <span className="text-xs font-semibold text-slate-500 w-6 pt-1">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
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
                className="font-semibold bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-accent focus:outline-none px-1 py-0.5 min-w-0 flex-1"
                aria-label={`Dish ${index + 1} name`}
                placeholder="Dish name"
              />
            ) : onNameChange ? (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="font-semibold text-left hover:text-accent hover:underline focus:outline-none focus:underline truncate max-w-full"
                aria-label={`Edit name for dish ${index + 1}`}
                title="Click to edit dish name"
              >
                {value.name || 'Untitled dish'}
              </button>
            ) : (
              <h3 className="font-semibold">{value.name || 'Untitled dish'}</h3>
            )}
            {value.recipeId && (
              <Link
                to={`/recipes/${value.recipeId}/edit`}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <BookOpen className="h-3 w-3" aria-hidden="true" />
                recipe
              </Link>
            )}
            {value.isPrepared && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Hand className="h-3 w-3" aria-hidden="true" />
                ready
              </span>
            )}
          </div>
          <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
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
            <div className="inline-flex items-center gap-1">
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
                  {formatDateTime(value.startAt)}
                </button>
              ) : (
                <span>{formatDateTime(value.startAt)}</span>
              )}
            </div>
          </dl>
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
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="mt-2 text-left text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap hover:text-accent focus:outline-none focus:text-accent w-full"
              aria-label={`Edit notes for dish ${index + 1}`}
              title="Click to edit notes"
            >
              {value.notes}
            </button>
          ) : value.notes ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{value.notes}</p>
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
