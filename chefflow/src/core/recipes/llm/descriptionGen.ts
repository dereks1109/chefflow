import type { Recipe } from '../../types';
import { complete } from '../../llm/llmClient';
import { stripMarkdownFences } from '../../llm/stripMarkdownFences';
import { LlmRecipeValidationError } from './recipeGenSchema';

export interface GenerateDescriptionInput {
  recipe: Recipe;
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const SYSTEM_PROMPT = [
  'You write short, appetising 1–2 sentence descriptions of cooked dishes for restaurant menus.',
  'Sprinkle 1–2 relevant food emojis (e.g. 🥩 🍝 🥗 🍅 🌶 🍷 🧀 🍋 🥖) where they enhance readability;',
  "don't lead with an emoji and don't crowd the prose with them.",
  'Return STRICT JSON with a single field `description` (string). No markdown, no extra fields.',
  'Plain prose, no quotation marks inside the description itself.',
].join(' ');

function buildUserPrompt(recipe: Recipe): string {
  const ingredientNames = recipe.ingredients
    .map((i) => i.name?.trim())
    .filter((n): n is string => Boolean(n))
    .slice(0, 20);
  return [
    `Dish: ${recipe.title || 'Untitled dish'}.`,
    ingredientNames.length > 0 ? `Ingredients: ${ingredientNames.join(', ')}.` : '',
    'Write 1–2 sentences that would entice a diner. Return only `{"description":"…"}`.',
  ].filter(Boolean).join('\n');
}

export async function generateDescription(input: GenerateDescriptionInput): Promise<string> {
  const raw = await complete({
    endpoint: 'generate',
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(input.recipe),
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });
  const stripped = stripMarkdownFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LlmRecipeValidationError(`LLM did not return valid JSON: ${message}`, 'description');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { description?: unknown }).description !== 'string'
  ) {
    throw new LlmRecipeValidationError('LLM response missing string `description`', 'description');
  }
  return ((parsed as { description: string }).description).trim();
}
