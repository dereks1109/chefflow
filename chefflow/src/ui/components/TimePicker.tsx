import { HOUR_OPTIONS, MINUTE_OPTIONS, parseTime, formatTime } from '../../core/util/time';

interface Props {
  label: string;
  value?: string;
  onChange: (next: string | undefined) => void;
}

function withCurrent(options: number[], current: number): number[] {
  if (options.includes(current)) return options;
  return [...options, current].sort((a, b) => a - b);
}

export default function TimePicker({ label, value, onChange }: Props) {
  const { hours, minutes } = parseTime(value);
  const hourOpts = withCurrent(HOUR_OPTIONS, hours);
  const minuteOpts = withCurrent(MINUTE_OPTIONS, minutes);

  return (
    <div>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1 flex gap-2">
        <select
          aria-label={`${label} hours`}
          value={hours}
          onChange={(e) => onChange(formatTime(Number(e.target.value), minutes))}
          className="input"
        >
          {hourOpts.map((h) => (
            <option key={h} value={h}>{h}h</option>
          ))}
        </select>
        <select
          aria-label={`${label} minutes`}
          value={minutes}
          onChange={(e) => onChange(formatTime(hours, Number(e.target.value)))}
          className="input"
        >
          {minuteOpts.map((m) => (
            <option key={m} value={m}>{m}m</option>
          ))}
        </select>
      </div>
    </div>
  );
}
