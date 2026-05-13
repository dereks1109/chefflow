import { Trash2, Clock, AlertTriangle } from 'lucide-react';
import type { Session } from '../../core/types';
import { randomId } from '../../core/util/id';
import { toLocalInputValue, fromLocalInputValue, isSameLocalDate } from '../../core/util/datetime';

interface Props {
  index: number;
  value: Session;
  eventServeAt?: string;
  onChange: (next: Session) => void;
  onRemove: () => void;
}

export default function SessionRow({ index, value, eventServeAt, onChange, onRemove }: Props) {
  const startsBeforeEnds = new Date(value.startAt).getTime() < new Date(value.endAt).getTime();
  const validRange = Boolean(value.startAt) && Boolean(value.endAt) && startsBeforeEnds;
  const dateMatches = !eventServeAt || isSameLocalDate(value.startAt, eventServeAt);

  function setStart(local: string) {
    onChange({ ...value, startAt: fromLocalInputValue(local) ?? '' });
  }
  function setEnd(local: string) {
    onChange({ ...value, endAt: fromLocalInputValue(local) ?? '' });
  }

  return (
    <li className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
      <div className="flex items-start gap-3">
        <span className="text-xs font-semibold text-slate-500 w-6 pt-2">{index + 1}.</span>
        <div className="flex-1 space-y-3 min-w-0">
          <input
            type="text"
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            className="input"
            aria-label={`Session ${index + 1} title`}
            placeholder="Session title (e.g. Prep, Sear, Plate)"
          />

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Time</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-xs text-slate-500 space-y-1">
              <span>Start</span>
              <input
                type="datetime-local"
                value={toLocalInputValue(value.startAt)}
                onChange={(e) => setStart(e.target.value)}
                className="input"
                aria-label={`Session ${index + 1} start time`}
              />
            </label>
            <label className="text-xs text-slate-500 space-y-1">
              <span>End</span>
              <input
                type="datetime-local"
                value={toLocalInputValue(value.endAt)}
                onChange={(e) => setEnd(e.target.value)}
                className="input"
                aria-label={`Session ${index + 1} end time`}
              />
            </label>
          </div>

          {!validRange && (value.startAt || value.endAt) && (
            <div className="flex items-center gap-2 text-xs text-danger">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>End time must be after start time.</span>
            </div>
          )}
          {validRange && !dateMatches && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Session date doesn't match the event date.</span>
            </div>
          )}

          <textarea
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            className="input"
            rows={2}
            aria-label={`Session ${index + 1} notes`}
            placeholder="Notes (optional)"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="touch-target px-3 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-danger shrink-0 self-start"
          aria-label={`Remove session ${index + 1}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

export function blankSession(eventServeAt?: string): Session {
  // Default new session to the event date (if any) at a placeholder time.
  const base = eventServeAt ? new Date(eventServeAt) : new Date();
  base.setHours(12, 0, 0, 0);
  const start = base.toISOString();
  const endDate = new Date(base);
  endDate.setHours(13, 0, 0, 0);
  return {
    id: randomId(),
    title: '',
    startAt: start,
    endAt: endDate.toISOString(),
    notes: '',
  };
}

export function sessionHasValidRange(s: Session): boolean {
  if (!s.startAt || !s.endAt) return false;
  return new Date(s.startAt).getTime() < new Date(s.endAt).getTime();
}
