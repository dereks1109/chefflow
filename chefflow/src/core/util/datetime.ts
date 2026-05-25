// Helpers for round-tripping between ISO datetimes (stored) and the
// "YYYY-MM-DDTHH:mm" string that <input type="datetime-local"> expects.
// Conversion uses local time so the chef sees what they typed.

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalInputValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

const LOCALE = 'en-GB';

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return 'Not scheduled';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Time-only formatter (e.g. "18:30"). Used in tight timeline rows where
 * the date is already implied by the event context. Returns "—" on missing
 * or invalid input rather than the long "Not scheduled" / "Invalid date"
 * strings so the row stays compact.
 */
export function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const t = (d: Date) => d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `${t(start)} – ${t(end)}`;
  return `${formatDateTime(startIso)} → ${formatDateTime(endIso)}`;
}

export function isSameLocalDate(aIso: string | undefined, bIso: string | undefined): boolean {
  if (!aIso || !bIso) return true; // skip check when either side is missing
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return true;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
