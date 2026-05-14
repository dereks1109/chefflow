import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronUp, Clock, Edit3, Hand, Trash2, Users } from 'lucide-react';
import type { Dish } from '../../core/types';
import { formatDateTime } from '../../core/util/datetime';

interface Props {
  index: number;
  value: Dish;
  reorderMode?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export default function DishRow({
  index,
  value,
  reorderMode,
  canMoveUp,
  canMoveDown,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
}: Props) {
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
              <span>{formatDateTime(value.startAt)}</span>
            </div>
          </dl>
          {value.notes && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{value.notes}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
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
