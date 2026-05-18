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
}: Props) {
  const [editingTime, setEditingTime] = useState(false);
  const timeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTime) timeInputRef.current?.focus();
  }, [editingTime]);

  function commitTime(raw: string) {
    if (!onTimeChange) {
      setEditingTime(false);
      return;
    }
    const next = fromLocalInputValue(raw);
    if (next && next !== value.startAt) onTimeChange(next);
    setEditingTime(false);
  }
  return (
    <li className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-3">
      <div className="flex items-start gap-3">
        <span className="text-xs font-semibold text-slate-500 w-6 pt-1">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{value.name || 'Untitled dish'}</h3>
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
              <span>{value.portions} portion{value.portions === 1 ? '' : 's'}</span>
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
          {value.notes && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{value.notes}</p>
          )}
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
              >
                <Edit3 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="touch-target px-2 rounded-md text-slate-500 hover:text-danger"
                aria-label={`Remove dish ${index + 1}`}
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
