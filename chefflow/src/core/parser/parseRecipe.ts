import matter from 'gray-matter';
import type { Recipe, Ingredient, WorkflowStep } from '../types';

export function parseRecipe(md: string): Recipe {
  const { data, content } = matter(md);
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled Recipe';

  return {
    id: String(data.recipe_id ?? cryptoRandomId()),
    title,
    originalYield: Number(data.original_yield ?? 1),
    prepTime: data.prep_time ? String(data.prep_time) : undefined,
    cookTime: data.cook_time ? String(data.cook_time) : undefined,
    ingredients: parseIngredients(content),
    steps: parseSteps(content),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const INGREDIENT_REGEX =
  /^\s*-\s*\[\s*\]\s*\{(?<amount>[^|]+)\|(?<unit>[^|]+)\|(?<name>[^}]+)\}(?<locked>\s*\(LOCKED\))?\s*$/gm;

function parseIngredients(content: string): Ingredient[] {
  const ingredients: Ingredient[] = [];
  // Reset regex state since /g is stateful.
  INGREDIENT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = INGREDIENT_REGEX.exec(content)) !== null) {
    const g = match.groups!;
    const raw = `{${g.amount}|${g.unit}|${g.name}}`;
    index += 1;
    ingredients.push({
      id: `i${index}`,
      raw,
      amount: Number(g.amount),
      unit: g.unit.trim(),
      name: g.name.trim(),
      isLocked: Boolean(g.locked),
    });
  }
  return ingredients;
}

function parseSteps(_content: string): WorkflowStep[] {
  // Stub for now — populated in later task
  return [];
}

function cryptoRandomId(): string {
  return 'r_' + Math.random().toString(36).slice(2, 10);
}
