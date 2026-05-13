import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RecipeCard from '../components/RecipeCard';
import { listRecipes, saveRecipe, deleteRecipe } from '../../db/recipesRepo';
import { randomId } from '../../core/util/id';
import type { Recipe } from '../../core/types';

export default function RecipesLibrary() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const navigate = useNavigate();

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
    if (!window.confirm(`Delete "${target.title}"? This cannot be undone.`)) return;
    await deleteRecipe(target.id);
    setRecipes(await listRecipes());
  }

  async function handleCreateNew() {
    const fresh: Recipe = {
      id: randomId(),
      title: 'Untitled recipe',
      originalYield: 1,
      ingredients: [],
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveRecipe(fresh);
    navigate(`/recipes/${fresh.id}/edit`);
  }

  if (recipes === null) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  if (recipes.length === 0) {
    return (
      <section className="p-6 text-center">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <p className="mt-4 text-slate-600 dark:text-slate-400">No recipes yet.</p>
        <Link
          to="#"
          onClick={(e) => {
            e.preventDefault();
            void handleCreateNew();
          }}
          className="btn-primary mt-6 inline-flex"
        >
          Create your first recipe
        </Link>
      </section>
    );
  }

  return (
    <section className="p-4 md:p-6">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <button type="button" onClick={() => void handleCreateNew()} className="btn-primary">
          New recipe
        </button>
      </header>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {recipes.map((r) => (
          <li key={r.id}>
            <RecipeCard recipe={r} onDuplicate={handleDuplicate} onDelete={handleDelete} />
          </li>
        ))}
      </ul>
    </section>
  );
}
