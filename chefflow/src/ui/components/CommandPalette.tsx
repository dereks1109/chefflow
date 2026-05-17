import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CalendarDays, ListChecks, X, Search } from 'lucide-react';

interface PaletteItem {
  id: string;
  label: string;
  description: string;
  to: string;
  icon: typeof BookOpen;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    id: 'recipes',
    label: 'Recipes',
    description: 'Browse and manage your recipe library',
    to: '/recipes',
    icon: BookOpen,
  },
  {
    id: 'events',
    label: 'Events',
    description: 'View and plan kitchen events',
    to: '/events',
    icon: CalendarDays,
  },
  {
    id: 'workflows',
    label: 'Workflows',
    description: 'Coordinate multi-recipe kitchen schedules',
    to: '/workflows',
    icon: ListChecks,
  },
];

function fuzzyMatch(query: string, item: PaletteItem): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q)
  );
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Inner palette — only mounts when isOpen=true, so initial state is always
 * clean. No setState-in-effect needed.
 */
function PaletteInner({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const filtered = PALETTE_ITEMS.filter((item) => fuzzyMatch(query, item));
  // Clamp derived — read-time clamp so no setState-in-effect required
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  // Focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleSelect = useCallback(
    (to: string) => {
      navigate(to);
      onClose();
    },
    [navigate, onClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < filtered.length - 1 ? prev + 1 : prev,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[safeActiveIndex]) {
            handleSelect(filtered[safeActiveIndex].to);
          }
          break;
      }
    },
    [safeActiveIndex, filtered, handleSelect, onClose],
  );

  return (
    /* Backdrop */
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={[
          'relative w-full max-w-lg',
          'rounded-xl border border-[rgba(255,255,255,0.08)]',
          'bg-surface-1 shadow-2xl shadow-black/60',
          'animate-fade-up',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 border-b border-[rgba(255,255,255,0.06)]">
          <Search size={18} className="shrink-0 text-slate-500" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="palette-listbox"
            aria-activedescendant={
              filtered[safeActiveIndex]
                ? `palette-item-${filtered[safeActiveIndex].id}`
                : undefined
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search pages…"
            className={[
              'flex-1 h-14 bg-transparent text-base text-slate-100',
              'placeholder:text-slate-500',
              'focus:outline-none',
            ].join(' ')}
          />
          <button
            type="button"
            aria-label="Close command palette"
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded text-slate-500 hover:text-slate-300 hover:bg-surface-3 transition-colors"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Results */}
        <ul
          id="palette-listbox"
          role="listbox"
          aria-label="Navigation options"
          className="py-2 max-h-72 overflow-y-auto"
        >
          {filtered.length === 0 && (
            <li
              className="px-4 py-8 text-center text-sm text-slate-500"
              role="option"
              aria-selected="false"
            >
              No results for &ldquo;{query}&rdquo;
            </li>
          )}
          {filtered.map((item, index) => {
            const Icon = item.icon;
            const isActive = index === safeActiveIndex;
            return (
              <li
                key={item.id}
                id={`palette-item-${item.id}`}
                role="option"
                aria-selected={isActive}
                className={[
                  'flex items-center gap-3 mx-2 px-3 py-3 rounded-lg cursor-pointer',
                  'transition-colors duration-100',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-slate-300 hover:bg-surface-3',
                ].join(' ')}
                onClick={() => handleSelect(item.to)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span
                  className={[
                    'flex items-center justify-center h-8 w-8 rounded-md shrink-0',
                    isActive ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-slate-400',
                  ].join(' ')}
                >
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-medium leading-tight">{item.label}</span>
                  <span className="text-xs text-slate-500 truncate">{item.description}</span>
                </span>
              </li>
            );
          })}
        </ul>

        {/* Footer hints */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[rgba(255,255,255,0.06)] text-xs text-slate-600">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  // Mount PaletteInner only when open — this gives fresh state automatically
  if (!isOpen) return null;
  return <PaletteInner onClose={onClose} />;
}
