import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Plus, Hand, BookOpen, X, Check, AlertTriangle, ChefHat } from 'lucide-react';
import type { Dish, Recipe } from '../../core/types';
import { randomId } from '../../core/util/id';
import { toLocalInputValue, fromLocalInputValue, isSameLocalDate } from '../../core/util/datetime';
import { listRecipes, saveRecipe } from '../../db/recipesRepo';
import ColorPicker from './ColorPicker';

interface Props {
  initial: Dish;
  eventServeAt?: string;
  onConfirm: (next: Dish) => void;
  onCancel: () => void;
}

export default function DishForm({ initial, eventServeAt, onConfirm, onCancel }: Props) {
  const [draft, setDraft] = useState<Dish>(initial);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [creatingRecipe, setCreatingRecipe] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRecipes().then(setRecipes);
  }, []);

  const query = draft.name.trim();
  const matches = useMemo(() => {
    if (query.length < 1) return [];
    const q = query.toLowerCase();
    return recipes.filter((r) => r.title.toLowerCase().includes(q)).slice(0, 6);
  }, [recipes, query]);

  const exactMatch = matches.find((r) => r.title.toLowerCase() === query.toLowerCase());
  const noMatch = query.length >= 2 && matches.length === 0;
  const dateMatches = isSameLocalDate(draft.startAt, eventServeAt);
  const valid = draft.name.trim().length > 0 && draft.portions > 0 && Boolean(draft.startAt);

  function pickRecipe(r: Recipe) {
    setDraft({ ...draft, name: r.title, recipeId: r.id, isPrepared: false });
    setShowSuggestions(false);
  }

  function markPrepared() {
    setDraft({ ...draft, recipeId: undefined, isPrepared: true });
    setShowSuggestions(false);
  }

  async function createRecipeStub() {
    if (!query) return;
    setCreatingRecipe(true);
    const id = randomId();
    const now = Date.now();
    const stub: Recipe = {
      id,
      title: query,
      originalYield: 1,
      ingredients: [],
      steps: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveRecipe(stub);
    setRecipes((prev) => [stub, ...prev]);
    setDraft({ ...draft, recipeId: id, isPrepared: false });
    setShowSuggestions(false);
    setCreatingRecipe(false);
  }

  const linkedRecipe = draft.recipeId ? recipes.find((r) => r.id === draft.recipeId) : undefined;

  return (
    <div className="rounded-lg border border-accent/40 bg-white dark:bg-kitchen-ink p-4 space-y-3 shadow-sm">
      <div className="relative">
        <label className="text-xs font-medium text-slate-500">Dish name</label>
        <input
          ref={nameRef}
          type="text"
          value={draft.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value, recipeId: undefined, isPrepared: false });
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          className="input mt-1"
          placeholder="Start typing to search recipes…"
          aria-label="Dish name"
          autoComplete="off"
        />

        {showSuggestions && (matches.length > 0 || noMatch) && (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-lg overflow-hidden">
            {matches.length > 0 && (
              <ul className="max-h-48 overflow-auto">
                {matches.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => pickRecipe(r)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <BookOpen className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      <span className="flex-1 truncate">{r.title}</span>
                      <span className="text-xs text-slate-500">{r.originalYield} portion{r.originalYield === 1 ? '' : 's'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {noMatch && !exactMatch && (
              <div className="border-t border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <p className="text-xs text-slate-500">
                  No recipe matches "<span className="font-medium text-slate-700 dark:text-slate-300">{query}</span>".
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => void createRecipeStub()}
                    disabled={creatingRecipe}
                    className="btn-secondary text-sm inline-flex items-center justify-center gap-1 flex-1 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Create new recipe
                  </button>
                  <button
                    type="button"
                    onClick={markPrepared}
                    className="btn-secondary text-sm inline-flex items-center justify-center gap-1 flex-1"
                  >
                    <Hand className="h-3.5 w-3.5" aria-hidden="true" />
                    I'll get the dish ready
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {linkedRecipe && (
        <p className="text-xs text-slate-500 inline-flex items-center gap-1">
          <BookOpen className="h-3 w-3" aria-hidden="true" />
          Linked to recipe <span className="font-medium text-slate-700 dark:text-slate-300">{linkedRecipe.title}</span>
        </p>
      )}
      {!linkedRecipe && draft.isPrepared && (
        <p className="text-xs text-slate-500 inline-flex items-center gap-1">
          <Hand className="h-3 w-3" aria-hidden="true" />
          Marked as ready — no recipe needed.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-slate-500 space-y-1">
          <span>Portions</span>
          <input
            type="number"
            min={1}
            value={draft.portions}
            onChange={(e) => setDraft({ ...draft, portions: Math.max(1, Number(e.target.value) || 1) })}
            className="input"
            aria-label="Portions"
          />
        </label>
        <label className="text-xs font-medium text-slate-500 space-y-1">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" /> Start time</span>
          <input
            type="datetime-local"
            value={toLocalInputValue(draft.startAt)}
            onChange={(e) => setDraft({ ...draft, startAt: fromLocalInputValue(e.target.value) ?? '' })}
            className="input"
            aria-label="Start time"
          />
        </label>
      </div>

      {draft.startAt && !dateMatches && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Start time isn't on the event date.</span>
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <label className="text-xs font-medium text-slate-500 space-y-1">
          <span className="inline-flex items-center gap-1">
            <ChefHat className="h-3 w-3" aria-hidden="true" />
            Chef in charge (optional)
          </span>
          <input
            type="text"
            value={draft.chefName ?? ''}
            onChange={(e) => setDraft({ ...draft, chefName: e.target.value || undefined })}
            className="input"
            placeholder="e.g. Marco"
            aria-label="Chef in charge"
          />
        </label>
        <div className="flex flex-col items-center gap-1 pb-1">
          <span className="text-xs font-medium text-slate-500">Color</span>
          <ColorPicker
            value={draft.colorTag}
            onChange={(c) => setDraft({ ...draft, colorTag: c })}
            label="Color tag for this dish"
          />
        </div>
      </div>

      <label className="text-xs font-medium text-slate-500 block">
        <span>Notes (optional)</span>
        <textarea
          value={draft.notes ?? ''}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value || undefined })}
          className="input mt-1"
          rows={2}
          aria-label="Notes"
          placeholder="Anything specific about this dish…"
        />
      </label>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel dish"
          className="btn-secondary inline-flex items-center gap-1"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(draft)}
          disabled={!valid}
          aria-label="Confirm dish"
          className="btn-primary inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Confirm
        </button>
      </div>
    </div>
  );
}

export function blankDish(eventServeAt?: string): Dish {
  const base = eventServeAt ? new Date(eventServeAt) : new Date();
  if (Number.isNaN(base.getTime())) base.setTime(Date.now());
  base.setHours(12, 0, 0, 0);
  return {
    id: randomId(),
    name: '',
    portions: 1,
    startAt: base.toISOString(),
  };
}
