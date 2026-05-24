import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus } from 'lucide-react';
import RecipeCard from '../components/RecipeCard';
import GenerateRecipeSheet from '../components/GenerateRecipeSheet';
import AllergenAdvisoryBanner from '../components/AllergenAdvisoryBanner';
import { listRecipes, saveRecipe, deleteRecipe } from '../../db/recipesRepo';
import { randomId } from '../../core/util/id';
import type { Recipe } from '../../core/types';

export default function RecipesLibrary() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [newRecipeOpen, setNewRecipeOpen] = useState(false);
  const navigate = useNavigate();

  // Banner is shown only when the library actually contains an
  // AI-flagged allergen — first-time users with empty / unflagged
  // libraries see no nag.
  const hasAllergens = useMemo(
    () => (recipes ?? []).some((r) => (r.analysis?.allergens?.length ?? 0) > 0),
    [recipes],
  );

  async function handleCreated(r: Recipe) {
    await saveRecipe(r);
    setRecipes(await listRecipes());
    setNewRecipeOpen(false);
    navigate(`/recipes/${r.id}/edit`);
  }

  useEffect(() => {
    listRecipes().then(setRecipes);
  }, []);

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
          onClick={() => setNewRecipeOpen(true)}
          className="btn-primary mt-6 inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create your first recipe
        </button>
        <GenerateRecipeSheet
          open={newRecipeOpen}
          onClose={() => setNewRecipeOpen(false)}
          onCreated={handleCreated}
        />
      </section>
    );
  }

  return (
    <section className="p-4 md:p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-6 gap-2">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <button
          type="button"
          onClick={() => setNewRecipeOpen(true)}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New recipe
        </button>
      </header>

      <AllergenAdvisoryBanner enabled={hasAllergens} />
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {recipes.map((r) => (
          <li key={r.id}>
            <RecipeCard
              recipe={r}
              onTogglePin={handleTogglePin}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          </li>
        ))}
      </ul>
      <GenerateRecipeSheet
        open={newRecipeOpen}
        onClose={() => setNewRecipeOpen(false)}
        onCreated={handleCreated}
      />
    </section>
  );
}
