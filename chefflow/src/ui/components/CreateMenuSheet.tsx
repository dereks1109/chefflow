import { useEffect, useState } from 'react';
import { Layers, X, AlertTriangle } from 'lucide-react';
import { randomId } from '../../core/util/id';
import GroupShareChipRow from './GroupShareChipRow';
import type { Menu, Recipe } from '../../core/types';

interface Props {
  open: boolean;
  onClose: () => void;
  recipes: Recipe[];
  defaultTitle?: string;
  onConfirm: (menu: Menu) => Promise<void> | void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

function newMenuId(): string {
  return 'm_' + randomId().slice(2);
}

export default function CreateMenuSheet({
  open,
  onClose,
  recipes,
  defaultTitle,
  onConfirm,
}: Props) {
  const [title, setTitle] = useState<string>(defaultTitle ?? '');
  const [description, setDescription] = useState<string>('');
  const [sharedWithGroupIds, setSharedWithGroupIds] = useState<string[] | undefined>(undefined);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle ?? '');
    setDescription('');
    setSharedWithGroupIds(undefined);
    setStatus({ kind: 'idle' });
  }, [open, defaultTitle]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submitting = status.kind === 'submitting';
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const canSubmit =
    !submitting && trimmedTitle.length > 0 && recipes.length > 0;

  async function handleConfirm() {
    if (!canSubmit) return;
    const now = Date.now();
    const menu: Menu = {
      id: newMenuId(),
      title: trimmedTitle,
      description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
      recipeIds: recipes.map((r) => r.id),
      createdAt: now,
      updatedAt: now,
      // T4 Phase 3 — carry the chef's tick selection into the saved
      // menu so members in the chosen groups see it on their next
      // sync pull. Undefined when the chef isn't Enterprise (chip
      // row doesn't render); the worker sync filter treats absent
      // as "private, fan to nobody".
      sharedWithGroupIds,
    };
    setStatus({ kind: 'submitting' });
    try {
      await onConfirm(menu);
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-menu-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2
            id="create-menu-title"
            className="font-semibold inline-flex items-center gap-2"
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            Create menu
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="touch-target px-2 rounded-md text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4 text-sm">
          {/* T4 Phase 3 — per-item team-share chips. Self-hides for
              non-Enterprise tiers so non-team chefs see no UI change. */}
          <GroupShareChipRow
            selectedGroupIds={sharedWithGroupIds}
            onChange={setSharedWithGroupIds}
          />
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input mt-1"
              aria-label="Menu title"
              data-testid="create-menu-title-input"
              placeholder="e.g. Summer tasting menu"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input mt-1 min-h-[5rem]"
              aria-label="Menu description"
              data-testid="create-menu-description-input"
              placeholder="Chef notes about this menu…"
            />
          </label>

          <div>
            <span className="block text-xs font-medium text-slate-500 mb-1">
              {recipes.length === 1
                ? '1 recipe selected'
                : `${recipes.length} recipes selected`}
            </span>
            <ul
              className="rounded-md border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-auto"
              data-testid="create-menu-recipe-list"
            >
              {recipes.map((r) => (
                <li
                  key={r.id}
                  className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
                >
                  {r.title || 'Untitled recipe'}
                </li>
              ))}
            </ul>
          </div>

          {status.kind === 'error' && (
            <div
              role="status"
              className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-900 dark:text-red-200"
            >
              <p className="font-medium inline-flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Couldn't create the menu
              </p>
              <p className="mt-1 text-xs whitespace-pre-wrap">
                {status.message}
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canSubmit}
            data-testid="create-menu-confirm"
            className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            {submitting ? 'Creating…' : 'Create menu'}
          </button>
        </footer>
      </div>
    </div>
  );
}
