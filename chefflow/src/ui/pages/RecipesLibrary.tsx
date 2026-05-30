import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Check, Layers, Plus, Search, Square, X } from 'lucide-react';
import RecipeCard from '../components/RecipeCard';
import GenerateRecipeSheet from '../components/GenerateRecipeSheet';
import CreateMenuSheet from '../components/CreateMenuSheet';
import { listRecipes, saveRecipe, deleteRecipe, subscribeRecipes } from '../../db/recipesRepo';
import { deleteMenu, listMenus, saveMenu, subscribeMenus } from '../../db/menusRepo';
import { randomId } from '../../core/util/id';
import { consumeDailyQuota, QuotaExceededError } from '../../core/tier/quotaClient';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { useAuthGate, useIsGuest } from '../../state/useAuthGate';
import { fetchPublicDemos } from '../../core/demos/demosClient';
import GuestBrowseBanner from '../components/GuestBrowseBanner';
import { filterRecipes, filterRecipesByMenu } from '../../core/util/recipeSearch';
import type { Menu, Recipe } from '../../core/types';

export default function RecipesLibrary() {
  const requireAuth = useAuthGate();
  const isGuest = useIsGuest();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [menus, setMenus] = useState<Menu[] | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [newRecipeOpen, setNewRecipeOpen] = useState(false);
  // Carried over when the chef clicked "Create new recipe: <name>" in the
  // event timeline's dish-name autocomplete; pre-fills the blank recipe's
  // title so they don't have to re-type it in the editor.
  const [prefillTitle, setPrefillTitle] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-open the new-recipe sheet when navigated here with
  // `state: { openNewRecipe: true, prefillTitle? }`. Consume the state
  // once and clear it so back-nav doesn't re-trigger.
  useEffect(() => {
    const state = location.state as
      | { openNewRecipe?: boolean; prefillTitle?: string }
      | null;
    if (!state?.openNewRecipe) return;
    setPrefillTitle(state.prefillTitle);
    setNewRecipeOpen(true);
    window.history.replaceState({ ...window.history.state, usr: null }, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchInput), 150);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function handleCreated(r: Recipe) {
    try {
      await consumeDailyQuota({ kind: 'recipe' });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        useUpgradeSheetStore.getState().openWith('recipe');
        return;
      }
      throw err;
    }
    await saveRecipe(r);
    setRecipes(await listRecipes());
    setNewRecipeOpen(false);
    setPrefillTitle(undefined);
    navigate(`/recipes/${r.id}/edit`);
  }

  function handleSheetClose() {
    setNewRecipeOpen(false);
    setPrefillTitle(undefined);
  }

  // Live subscriptions — re-render the library every time Dexie commits
  // (including when the D1 sync engine pulls demos into Dexie post-login).
  // Replaces the old one-shot listRecipes() that snapshotted Dexie before
  // the sync had finished. The unsubscribe runs on unmount.
  //
  // Guest branch: signed-out visitors never touch Dexie (avoids writing
  // demo rows under the anon scope that would get migrated into the
  // chef's library on first sign-in). Instead we one-shot fetch demos
  // from the public worker endpoint. The card grid renders the same
  // way; only write actions short-circuit via requireAuth.
  useEffect(() => {
    if (!isGuest) return subscribeRecipes(setRecipes);
    let cancelled = false;
    void fetchPublicDemos()
      .then((d) => { if (!cancelled) setRecipes(d.recipes); })
      .catch(() => { if (!cancelled) setRecipes([]); });
    return () => { cancelled = true; };
  }, [isGuest]);
  useEffect(() => subscribeMenus(setMenus), []);

  async function handleDuplicate(source: Recipe) {
    const copy: Recipe = {
      ...source,
      id: randomId(),
      title: `${source.title} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveRecipe(copy);
    setRecipes(await listRecipes());
  }

  async function handleDelete(target: Recipe) {
    if (target.id.startsWith('r_demo_')) return;
    if (!window.confirm(`Delete "${target.title}"? This cannot be undone.`)) return;
    await deleteRecipe(target.id);
    setRecipes(await listRecipes());
  }

  async function handleTogglePin(target: Recipe) {
    await saveRecipe({ ...target, isPinned: !target.isPinned });
    setRecipes(await listRecipes());
  }

  async function handleCoverPhotoChange(target: Recipe, next: string | undefined) {
    await saveRecipe({ ...target, coverPhoto: next, updatedAt: Date.now() });
    setRecipes(await listRecipes());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setCreateMenuOpen(false);
  }

  async function handleCreateMenu(fresh: Menu) {
    await saveMenu(fresh);
    setMenus(await listMenus());
    setActiveMenuId(fresh.id);
    exitSelectMode();
  }

  async function handleDeleteMenu(target: Menu) {
    if (!window.confirm(`Delete menu "${target.title}"?`)) return;
    await deleteMenu(target.id);
    const next = await listMenus();
    setMenus(next);
    if (activeMenuId === target.id) setActiveMenuId(null);
  }

  const activeMenu = useMemo(
    () => (activeMenuId ? menus?.find((m) => m.id === activeMenuId) ?? null : null),
    [menus, activeMenuId]
  );

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const byMenu = activeMenu
      ? filterRecipesByMenu(recipes, activeMenu.recipeIds)
      : recipes;
    return filterRecipes(byMenu, debouncedQuery);
  }, [recipes, activeMenu, debouncedQuery]);

  // Maps of recipeId → count and recipeId → parent titles for "used in N"
  // badge + hover tooltip. Lets RecipeCard render which OTHER recipes
  // reference it via an `@` (componentRecipeId) ingredient line, so chefs
  // see what they'd orphan before deleting a sub-recipe.
  const { usedByCount, usedByTitles } = useMemo(() => {
    const counts = new Map<string, number>();
    const titles = new Map<string, string[]>();
    if (!recipes) return { usedByCount: counts, usedByTitles: titles };
    for (const parent of recipes) {
      const seenInThisParent = new Set<string>();
      for (const ing of parent.ingredients) {
        if (!ing.componentRecipeId) continue;
        if (seenInThisParent.has(ing.componentRecipeId)) continue;
        seenInThisParent.add(ing.componentRecipeId);
        counts.set(ing.componentRecipeId, (counts.get(ing.componentRecipeId) ?? 0) + 1);
        const existing = titles.get(ing.componentRecipeId);
        if (existing) existing.push(parent.title);
        else titles.set(ing.componentRecipeId, [parent.title]);
      }
    }
    return { usedByCount: counts, usedByTitles: titles };
  }, [recipes]);

  const selectedRecipes = useMemo(
    () => (recipes ?? []).filter((r) => selectedIds.has(r.id)),
    [recipes, selectedIds]
  );
  const selectedCount = selectedRecipes.length;

  if (recipes === null) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  if (recipes.length === 0) {
    return (
      <section className="p-6 text-center max-w-md mx-auto">
        <BookOpen className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold mt-4">Recipes</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">No recipes yet.</p>
        <button
          type="button"
          onClick={() => requireAuth(() => setNewRecipeOpen(true))}
          className="btn-primary mt-6 inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create your first recipe
        </button>
        <GenerateRecipeSheet
          open={newRecipeOpen}
          onClose={handleSheetClose}
          onCreated={handleCreated}
          initialTitle={prefillTitle}
        />
      </section>
    );
  }

  const trimmedQuery = debouncedQuery.trim();
  const hasMenus = (menus ?? []).length > 0;

  return (
    <section className="p-4 md:p-6 max-w-7xl mx-auto">
      {isGuest && <GuestBrowseBanner scope="recipes" />}
      <header className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {selectMode ? (
            <>
              <button
                type="button"
                onClick={() => setCreateMenuOpen(true)}
                disabled={selectedCount === 0}
                className="btn-secondary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                data-testid="recipes-combine-button"
              >
                <Layers className="h-4 w-4" aria-hidden="true" />
                Combine {selectedCount} into menu
              </button>
              <button
                type="button"
                onClick={exitSelectMode}
                className="btn-secondary inline-flex items-center gap-2"
                data-testid="recipes-cancel-select"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="btn-secondary inline-flex items-center gap-2"
                data-testid="recipes-create-menu-button"
              >
                <Layers className="h-4 w-4" aria-hidden="true" />
                Create menu
              </button>
              <button
                type="button"
                onClick={() => requireAuth(() => setNewRecipeOpen(true))}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New recipe
              </button>
            </>
          )}
        </div>
      </header>
      {hasMenus && (
        <div
          className="flex items-center gap-2 overflow-x-auto mb-3"
          data-testid="recipes-filter-chip-row"
        >
          <button
            type="button"
            onClick={() => setActiveMenuId(null)}
            aria-pressed={activeMenuId === null}
            data-testid="recipes-filter-chip-all"
            className={[
              'shrink-0 inline-flex items-center px-3 h-7 rounded-full text-xs font-medium transition-colors',
              activeMenuId === null
                ? 'bg-accent text-white'
                : 'bg-slate-100 text-slate-700 dark:bg-surface-2 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-surface-3',
            ].join(' ')}
          >
            All
          </button>
          {(menus ?? []).map((menu) => {
            const isActive = activeMenuId === menu.id;
            return (
              <span
                key={menu.id}
                className={[
                  'shrink-0 inline-flex items-center h-7 rounded-full text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-surface-2 dark:text-slate-300',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => setActiveMenuId(menu.id)}
                  aria-pressed={isActive}
                  data-testid={`recipes-filter-chip-${menu.id}`}
                  className={[
                    'inline-flex items-center gap-1.5 pl-3 pr-2 h-7 rounded-l-full',
                    isActive ? '' : 'hover:bg-slate-200 dark:hover:bg-surface-3',
                  ].join(' ')}
                >
                  <Layers className="h-3 w-3" aria-hidden="true" />
                  <span className="truncate max-w-[8rem]">{menu.title}</span>
                  <span className={isActive ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}>
                    ({menu.recipeIds.length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteMenu(menu)}
                  aria-label={`Delete menu ${menu.title}`}
                  data-testid={`recipes-filter-chip-delete-${menu.id}`}
                  className={[
                    'inline-flex items-center justify-center h-7 w-6 rounded-r-full',
                    isActive
                      ? 'hover:bg-accent/80'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-surface-3',
                  ].join(' ')}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="mb-4 relative w-full max-w-md">
        <Search
          className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search recipes…"
          aria-label="Search recipes"
          data-testid="recipes-search-input"
          className="w-full pl-9 pr-9 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
        />
        {searchInput !== '' && (
          <button
            type="button"
            onClick={() => setSearchInput('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="recipes-no-results">
          {activeMenu && trimmedQuery === ''
            ? 'This menu is empty'
            : `No recipes match “${trimmedQuery}”`}
        </p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
          {filtered.map((r) => {
            const checked = selectedIds.has(r.id);
            return (
              <li key={r.id} className="h-full relative">
                {/* T3c Phase 4 — small "Shared" tag on rows that came
                    from an Enterprise team owner the caller is a viewer
                    of. Visual-only here; the editor + workflow gates
                    are the real "no edits" enforcement. */}
                {r.readOnly && (
                  <span
                    data-testid="recipe-card-shared-tag"
                    className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                  >
                    Shared
                  </span>
                )}
                {selectMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      toggleSelected(r.id);
                    }}
                    aria-label={
                      checked
                        ? `Deselect ${r.title || 'recipe'}`
                        : `Select ${r.title || 'recipe'}`
                    }
                    aria-pressed={checked}
                    data-testid={`recipes-select-checkbox-${r.id}`}
                    className={[
                      'absolute top-2 left-2 z-10 h-7 w-7 inline-flex items-center justify-center rounded-md shadow-sm border',
                      checked
                        ? 'bg-accent text-white border-accent ring-2 ring-accent/40'
                        : 'bg-white dark:bg-surface-2 text-slate-500 dark:text-slate-300 border-slate-300 dark:border-slate-600',
                    ].join(' ')}
                  >
                    {checked ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Square className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                )}
                <RecipeCard
                  recipe={r}
                  usedByCount={usedByCount.get(r.id) ?? 0}
                  usedByTitles={usedByTitles.get(r.id)}
                  // Each write action threads through requireAuth so a guest
                  // clicking pin/duplicate/delete on a demo card opens the
                  // Clerk sign-in modal instead of silently writing under
                  // the anon scope. Signed-in chefs fire immediately.
                  onTogglePin={(t) => requireAuth(() => void handleTogglePin(t))}
                  onDuplicate={(t) => requireAuth(() => void handleDuplicate(t))}
                  onDelete={(t) => requireAuth(() => void handleDelete(t))}
                  onCoverPhotoChange={(next) => requireAuth(() => void handleCoverPhotoChange(r, next))}
                />
              </li>
            );
          })}
        </ul>
      )}
      <GenerateRecipeSheet
        open={newRecipeOpen}
        onClose={handleSheetClose}
        onCreated={handleCreated}
        initialTitle={prefillTitle}
      />
      <CreateMenuSheet
        open={createMenuOpen && selectedCount > 0}
        onClose={() => setCreateMenuOpen(false)}
        recipes={selectedRecipes}
        onConfirm={(menu) => handleCreateMenu(menu)}
      />
    </section>
  );
}
