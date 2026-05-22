import { useEffect, useMemo, useRef, useState } from 'react';
import { listRecipes } from '../../db/recipesRepo';
import type { Recipe } from '../../core/types';

interface Props {
  /** Query text the user has typed after the `#`. */
  query: string;
  /** Current recipe id — excluded so users can't self-reference. */
  excludeRecipeId?: string;
  /** Called when the user picks a recipe via mouse or Enter. */
  onSelect: (recipe: Recipe) => void;
  /** Called when the user dismisses (Escape or click outside). */
  onClose: () => void;
}

const MAX_RESULTS = 8;

/**
 * Dropdown of existing recipes filtered by `query`. Lives below the
 * ingredient name input. Uses listRecipes() (full library is small,
 * in-memory filter is fine). Mouse + ↑↓ + Enter + Escape supported.
 */
export default function RecipeAutocomplete({ query, excludeRecipeId, onSelect, onClose }: Props) {
  const [all, setAll] = useState<Recipe[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [trackedQuery, setTrackedQuery] = useState(query);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listRecipes()
      .then((list) => { if (!cancelled) setAll(list); })
      .catch(() => { if (!cancelled) setAll([]); });
    return () => { cancelled = true; };
  }, []);

  const matches = useMemo(() => {
    if (!all) return [];
    const q = query.trim().toLowerCase();
    const filtered = all
      .filter((r) => r.id !== excludeRecipeId)
      .filter((r) => q.length === 0 || r.title.toLowerCase().includes(q));
    return filtered.slice(0, MAX_RESULTS);
  }, [all, query, excludeRecipeId]);

  // Reset highlight when the filter changes. React's "store info from
  // previous renders" pattern — setState during render is permitted when
  // it's resetting derived state in response to a prop change, and avoids
  // the cascading-render warning that an effect would trigger.
  if (query !== trackedQuery) {
    setTrackedQuery(query);
    setActiveIdx(0);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (matches.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % matches.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => (i - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter')     { e.preventDefault(); onSelect(matches[activeIdx]); return; }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [matches, activeIdx, onSelect, onClose]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [onClose]);

  if (all === null) {
    return (
      <div
        ref={rootRef}
        role="listbox"
        aria-label="Recipe suggestions"
        className="mt-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-md px-3 py-2 text-xs text-slate-500"
      >
        Loading recipes…
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div
        ref={rootRef}
        role="listbox"
        aria-label="Recipe suggestions"
        className="mt-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-md px-3 py-2 text-xs text-slate-500"
      >
        No matching recipes. Keep typing or remove the <code>#</code>.
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      role="listbox"
      aria-label="Recipe suggestions"
      className="mt-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-md overflow-hidden"
    >
      {matches.map((r, i) => (
        <button
          key={r.id}
          type="button"
          role="option"
          aria-selected={i === activeIdx}
          onMouseEnter={() => setActiveIdx(i)}
          onClick={() => onSelect(r)}
          data-testid={`recipe-autocomplete-option-${r.id}`}
          className={[
            'block w-full text-left px-3 py-2 text-xs',
            i === activeIdx
              ? 'bg-accent/10 text-accent'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-surface-3',
          ].join(' ')}
        >
          <span className="font-medium">{r.title}</span>
          <span className="ml-2 text-xs text-slate-500">{r.originalYield} portion{r.originalYield === 1 ? '' : 's'}</span>
        </button>
      ))}
    </div>
  );
}
