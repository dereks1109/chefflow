import { parseTime, formatTime } from '../../core/util/time';

interface Props {
  label: string;
  value?: string;
  onChange: (next: string | undefined) => void;
}

// Two free-typed number inputs labelled Hours + Minutes. Replaced the
// prior pair of dropdowns so chefs can type "37 minutes" without scrolling
// a 12-option menu. Same prop contract as before — emits the on-disk
// "1h 30m" string via formatTime() so existing recipes round-trip cleanly.
export default function TimePicker({ label, value, onChange }: Props) {
  const { hours, minutes } = parseTime(value);

  function setHours(next: number) {
    const h = clamp(next, 0, 24);
    onChange(formatTime(h, minutes));
  }
  function setMinutes(next: number) {
    const m = clamp(next, 0, 59);
    onChange(formatTime(hours, m));
  }

  // T16 (a)(b) — restructured to inline label + right-anchored inputs
  // so the minutes input's right edge sits at the cell's right edge,
  // matching CalorieAnalysisSection + Yield/Price rows. The whole row
  // is `flex items-center justify-between` so the label is pushed left
  // and the [hh] Hours [mm] Minutes group is pushed right.
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={24}
          step={1}
          aria-label={`${label} hours`}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="input w-14 text-right"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400">h</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          step={1}
          aria-label={`${label} minutes`}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="input w-20 text-right"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400">m</span>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
