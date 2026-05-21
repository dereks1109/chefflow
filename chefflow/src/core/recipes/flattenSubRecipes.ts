import type { Recipe, WorkflowStep } from '../types';

// ---------------------------------------------------------------------------
// flattenSubRecipes — walk a recipe's ingredients; for each Ingredient that
// has a `componentRecipeId`, pull the referenced recipe in and prepend its
// (recursively flattened) steps onto the parent's step list.
//
// Step IDs from a sub-recipe are namespaced as `<subRecipeId>::<originalId>`
// to avoid collisions when the same step ID exists in two different recipes.
// Internal `dependsOn` references inside the sub-recipe are remapped to the
// same prefix so the dependency graph still resolves after merging.
//
// Cycles and runaway nesting are guarded by:
//   - `visited` set of recipe IDs along the current expansion path
//   - hard depth cap (default 5)
//
// Parent steps' `dependsOn` are deliberately left untouched. No cross-recipe
// dependencies are inferred — the chef can add them manually in the editor.
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DEPTH = 5;

export interface FlattenOptions {
  maxDepth?: number;
}

export function flattenSubRecipes(
  recipe: Recipe,
  recipesById: Map<string, Recipe>,
  opts: FlattenOptions = {},
): Recipe {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const subMerged = expandSubRecipes(recipe, recipesById, new Set<string>([recipe.id]), 0, maxDepth);
  return { ...recipe, steps: [...subMerged, ...recipe.steps] };
}

/**
 * Return only the sub-recipe expansions for `recipe` (each step namespaced
 * with its origin sub-recipe's id). The recipe's OWN steps are NOT
 * included — the caller is responsible for placing them.
 */
function expandSubRecipes(
  recipe: Recipe,
  recipesById: Map<string, Recipe>,
  visited: Set<string>,
  depth: number,
  maxDepth: number,
): WorkflowStep[] {
  const out: WorkflowStep[] = [];

  for (const ing of recipe.ingredients) {
    if (!ing.componentRecipeId) continue;
    const subId = ing.componentRecipeId;

    if (visited.has(subId)) {
      console.warn(`[flattenSubRecipes] cycle detected at recipe ${subId} (path: ${[...visited].join(' -> ')})`);
      continue;
    }
    if (depth >= maxDepth) {
      console.warn(`[flattenSubRecipes] max depth ${maxDepth} reached while expanding ${subId}`);
      continue;
    }
    const sub = recipesById.get(subId);
    if (!sub) continue; // Referenced recipe missing — quietly skip.

    const nestedVisited = new Set(visited);
    nestedVisited.add(subId);

    // Recurse: get sub's own sub-recipe expansions (already prefixed by their
    // own recipe ids inside the recursion).
    const subSubMerged = expandSubRecipes(sub, recipesById, nestedVisited, depth + 1, maxDepth);

    // Then add sub's OWN steps, prefixed with sub's id so they're unique.
    const subOwnPrefixed = sub.steps.map((s) => prefixStep(s, subId, sub.title));

    out.push(...subSubMerged, ...subOwnPrefixed);
  }

  return out;
}

function prefixStep(step: WorkflowStep, recipeId: string, recipeTitle: string): WorkflowStep {
  const prefix = `${recipeId}::`;
  return {
    ...step,
    id: prefix + step.id,
    dependsOn: step.dependsOn.map((d) => prefix + d),
    sourceRecipeId: recipeId,
    sourceRecipeTitle: recipeTitle,
  };
}
