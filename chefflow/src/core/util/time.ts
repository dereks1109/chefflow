export interface Duration {
  hours: number;
  minutes: number;
}

export const HOUR_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export function parseTime(s: string | undefined): Duration {
  if (!s) return { hours: 0, minutes: 0 };
  const hMatch = s.match(/(\d+)\s*h/);
  const mMatch = s.match(/(\d+)\s*m/);
  return {
    hours: hMatch ? Number(hMatch[1]) : 0,
    minutes: mMatch ? Number(mMatch[1]) : 0,
  };
}

export function formatTime(hours: number, minutes: number): string | undefined {
  if (hours === 0 && minutes === 0) return undefined;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

export function toMinutes(s: string | undefined): number {
  const { hours, minutes } = parseTime(s);
  return hours * 60 + minutes;
}
