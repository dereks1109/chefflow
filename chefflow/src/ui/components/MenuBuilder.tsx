import { useMemo, useState } from 'react';
import { ChefHat, Printer } from 'lucide-react';
import { useProfileStore } from '../../state/useProfileStore';
import { formatGBP } from '../../core/util/money';
import { formatDateTime } from '../../core/util/datetime';
import type { Dish, EventSection, KitchenEvent, Recipe } from '../../core/types';

// ---------------------------------------------------------------------------
// MenuBuilder — generate a customer-facing, printable menu from the
// event's dishes. Now a controlled component — EventView owns the
// open/closed state via the "Build menu" header button (which sits
// next to "Generate Workflow"). Tier-gating + the upgrade CTA live
// in EventView's header so MenuBuilder itself is only ever mounted
// when the chef has access and has actively opened it.
//
// Flow:
//   - Chef toggles which dishes appear (default: all included).
//   - Chef can override the header (default: event title + serveAt + chef
//     name) and per-dish prices (default: recipe.pricePerPortion if set).
//   - "Print menu" calls window.print(); the print-only stylesheet on the
//     hidden #print-menu container is what the browser actually renders.
// ---------------------------------------------------------------------------

interface Props {
  event: KitchenEvent;
  recipesById: Map<string, Recipe>;
  /** Externally-controlled visibility. Header button in EventView flips
   *  this on; "Close" inside the builder calls onClose to flip it off. */
  open: boolean;
  onClose: () => void;
}

interface DishLine {
  id: string;
  name: string;
  recipeId?: string;
  defaultPrice: number | undefined;
  customPrice: string;     // empty string = use default
  included: boolean;
}

function defaultPriceFor(dish: Dish, recipesById: Map<string, Recipe>): number | undefined {
  const r = dish.recipeId ? recipesById.get(dish.recipeId) : undefined;
  return r?.pricePerPortion;
}

export default function MenuBuilder({ event, recipesById, open, onClose }: Props) {
  const chefName = useProfileStore((s) => s.displayName);

  const [headerOverride, setHeaderOverride] = useState('');
  const [lines, setLines] = useState<DishLine[]>(() =>
    event.dishes.map((d) => ({
      id: d.id,
      name: d.name,
      recipeId: d.recipeId,
      defaultPrice: defaultPriceFor(d, recipesById),
      customPrice: '',
      included: true,
    })),
  );

  // Section grouping mirrors the event's manual sections. Dishes not in
  // any section render under "Unassigned" at the bottom (same convention
  // as the timeline).
  const grouped = useMemo(() => {
    const sections = event.sections ?? [];
    const dishById = new Map(lines.map((l) => [l.id, l]));
    const sectionGroups = sections.map((s) => ({
      section: s as EventSection | null,
      lines: s.dishIds.map((id) => dishById.get(id)).filter((l): l is DishLine => !!l && l.included),
    }));
    const assigned = new Set(sections.flatMap((s) => s.dishIds));
    const unassignedLines = lines.filter((l) => !assigned.has(l.id) && l.included);
    if (unassignedLines.length > 0) {
      sectionGroups.push({ section: null, lines: unassignedLines });
    }
    return sectionGroups.filter((g) => g.lines.length > 0);
  }, [event.sections, lines]);

  if (!open) return null;

  function toggleInclude(id: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, included: !l.included } : l)));
  }
  function setCustomPrice(id: string, raw: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, customPrice: raw } : l)));
  }

  function effectivePrice(line: DishLine): number | undefined {
    const raw = line.customPrice.trim();
    if (raw !== '') {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    }
    return line.defaultPrice;
  }

  const headerLine = headerOverride.trim().length > 0
    ? headerOverride.trim()
    : `${event.title || 'Menu'}${event.serveAt ? ` · ${formatDateTime(event.serveAt)}` : ''}${chefName ? ` · ${chefName}` : ''}`;

  return (
    <>
    <section
      aria-labelledby="menu-builder-heading"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 print:hidden"
    >
      <header className="flex items-start justify-between gap-2">
        <h2
          id="menu-builder-heading"
          className="text-sm font-semibold uppercase tracking-wide text-slate-500 inline-flex items-center gap-2"
        >
          <ChefHat className="h-3.5 w-3.5" aria-hidden="true" />
          Customer menu
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="menu-builder-close"
            className="btn-secondary text-sm"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            data-testid="menu-builder-print"
            className="btn-primary text-sm inline-flex items-center gap-1.5"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print menu
          </button>
        </div>
      </header>

      <label className="block mt-3">
        <span className="text-xs font-medium text-slate-500">Header (defaults to event title · time · your name)</span>
        <input
          type="text"
          value={headerOverride}
          onChange={(e) => setHeaderOverride(e.target.value)}
          placeholder={headerLine}
          className="input mt-1 text-sm"
          data-testid="menu-builder-header"
        />
      </label>

      <ul className="mt-4 space-y-2">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex items-center gap-2 text-sm"
          >
            <label className="inline-flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
              <input
                type="checkbox"
                checked={line.included}
                onChange={() => toggleInclude(line.id)}
                data-testid={`menu-builder-include-${line.id}`}
                className="h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
              />
              <span className={line.included ? 'text-slate-700 dark:text-slate-200 truncate' : 'text-slate-400 line-through truncate'}>
                {line.name || '(untitled dish)'}
              </span>
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={line.customPrice}
              onChange={(e) => setCustomPrice(line.id, e.target.value)}
              placeholder={line.defaultPrice !== undefined ? line.defaultPrice.toFixed(2) : '—'}
              aria-label={`Price for ${line.name}`}
              className="w-20 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 px-2 py-1 text-xs text-right"
            />
          </li>
        ))}
      </ul>
    </section>

    {/* Print-only menu — hidden on screen, takes over the page when
        window.print() fires. Driven by Tailwind's print: variant +
        @page rules in the print stylesheet on AppLayout's main. */}
    <div
      data-testid="menu-builder-print-area"
      className="hidden print:!block print:!p-8 print:!text-slate-900 print:!bg-white"
    >
      <header className="text-center mb-8">
        <h1 className="text-3xl font-serif font-bold">{headerLine}</h1>
      </header>
      {grouped.map(({ section, lines }) => (
        <section key={section?.id ?? 'unassigned'} className="mb-6">
          {section && (
            <h2 className="text-lg font-serif font-semibold uppercase tracking-wide mb-2 border-b border-slate-300 pb-1">
              {section.name}
            </h2>
          )}
          <ul className="space-y-2">
            {lines.map((line) => {
              const price = effectivePrice(line);
              return (
                <li
                  key={line.id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="font-serif">{line.name || '(untitled dish)'}</span>
                  {price !== undefined && (
                    <span className="font-mono text-sm">{formatGBP(price)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <footer className="text-center text-xs text-slate-600 mt-8 pt-4 border-t border-slate-300">
        Prepared by ChefFlow
      </footer>
    </div>
    </>
  );
}
