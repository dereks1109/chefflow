import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { ColorTag } from '../../core/types';

interface Props {
  value: ColorTag | undefined;
  onChange: (next: ColorTag | undefined) => void;
  /** aria-label for the swatch button (e.g. "Color tag for step 3") */
  label: string;
}

const COLORS: { tag: ColorTag; bg: string; label: string }[] = [
  { tag: 'red',    bg: 'bg-red-500',    label: 'Red' },
  { tag: 'orange', bg: 'bg-orange-500', label: 'Orange' },
  { tag: 'yellow', bg: 'bg-yellow-400', label: 'Yellow' },
  { tag: 'green',  bg: 'bg-green-500',  label: 'Green' },
  { tag: 'blue',   bg: 'bg-blue-500',   label: 'Blue' },
  { tag: 'purple', bg: 'bg-purple-500', label: 'Purple' },
];

export function swatchClassFor(tag: ColorTag | undefined): string {
  if (!tag) return 'bg-transparent border border-slate-300 dark:border-slate-600';
  return COLORS.find((c) => c.tag === tag)?.bg ?? '';
}

export default function ColorPicker({ value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className={`h-5 w-5 rounded-full transition-shadow hover:ring-2 hover:ring-accent/40 ${swatchClassFor(value)}`}
      />
      {open && (
        <div
          role="dialog"
          aria-label="Pick a color"
          className="absolute z-20 top-7 right-0 flex items-center gap-1.5 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-lg"
        >
          {COLORS.map((c) => {
            const selected = c.tag === value;
            return (
              <button
                key={c.tag}
                type="button"
                onClick={() => { onChange(c.tag); setOpen(false); }}
                aria-label={`Tag ${c.label}`}
                title={c.label}
                className={`relative h-6 w-6 rounded-full ${c.bg} ring-offset-1 ring-offset-white dark:ring-offset-kitchen-ink hover:ring-2 hover:ring-accent transition`}
              >
                {selected && <Check className="absolute inset-0 m-auto h-4 w-4 text-white" aria-hidden="true" />}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => { onChange(undefined); setOpen(false); }}
            aria-label="Clear color"
            title="Clear"
            className="h-6 w-6 rounded-full border border-slate-300 dark:border-slate-600 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-slate-500"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export { COLORS as COLOR_OPTIONS };
