// ---------------------------------------------------------------------------
// Prompt builders for LLM-assisted recipe creation + analysis.
//
// SYSTEM prompt is constant per build: shape contract + calorie rule +
// tagging rule. NO allergen output is requested — allergens are pure
// user-declared data (Food Information Regulations 2014: the chef, not
// ChefFlow, is the food business operator). USER prompt is built fresh per
// call (text mode = dish name; photo mode = caller appends the image part).
// ---------------------------------------------------------------------------

import type { MultimodalPart } from '../../scheduler/llm/groqClient';
import type { Recipe } from '../../types';

export function buildRecipeGenSystemPrompt(): string {
  return `You are a recipe assistant for ChefFlow. Output a single JSON object — no prose, no markdown fences, no comments.

JSON SCHEMA:
{
  "title": "string — dish name",
  "originalYield": <integer — portions this recipe makes>,
  "prepTime": "string — human-readable (e.g. \\"30 min\\") — optional",
  "cookTime": "string — human-readable (e.g. \\"2 hr\\") — optional",
  "ingredients": [
    {
      "raw": "string — \\"{amount|unit|name}\\" form — optional, synthesized if omitted",
      "amount": <number>,
      "unit": "string — g, kg, ml, L, tsp, tbsp, cup, oz, lb, piece, clove, etc.",
      "name": "string — lowercase, no brand names"
    }
  ],
  "steps": [
    {
      "text": "string — one cooking action; reference ingredients by name",
      "durationSec": <integer seconds — optional, defaults to 0 if unknown>,
      "phase": "prep" | "cook" | "serve"  (optional, defaults to \\"cook\\")
    }
  ],
  "analysis": {
    "caloriesPerPortion": <integer kcal — optional>,
    "caloriesTotal": <integer kcal — optional>,
    "keyIngredientTags": [<string array — 2 to 6 lowercase headline-ingredient tags>]
  }
}

CALORIE RULE:
- Compute caloriesTotal first from ingredient masses using standard food composition data (kcal per gram or per common-unit).
- Then caloriesPerPortion = round(caloriesTotal / originalYield).
- Both values must be integers.
- If you cannot estimate confidently, omit BOTH fields rather than guessing wildly.

KEY-INGREDIENT TAG RULE:
- 2 to 6 short lowercase tags naming the headline ingredients (e.g. "beef", "red wine", "cremini mushroom").
- Skip pantry staples (salt, pepper, water, oil, sugar, flour-as-thickener).
- Use singular nouns. Group obvious variants (use "beef" for chuck/sirloin/ribeye unless the cut is the headline).

DO NOT include allergen fields, uncertain-ingredient lists, or any allergen-related output. Allergens are declared exclusively by the chef in the recipe editor.

PORTION RULE:
- If the user specifies portions, set originalYield exactly and scale ingredient amounts to match.
- Otherwise pick a sensible default (typically 4).

Return ONLY the JSON object.`;
}

export interface TextUserPromptInput {
  dish: string;
  portions?: number;
}

/** Build the user message for the text-only path. */
export function buildTextUserPrompt({ dish, portions }: TextUserPromptInput): string {
  const portionLine = portions
    ? `Portions: ${portions}`
    : 'Portions: pick a sensible default (typically 4).';
  return `Dish: ${dish.trim()}
${portionLine}

Return the JSON object for this recipe.`;
}

export interface PhotoUserMessageInput {
  imageDataUrl: string;
  portions?: number;
}

/**
 * Build the multimodal user message for the photo path. Caller passes this
 * straight into groqClient.complete({ userContent: ... }).
 */
export function buildPhotoUserMessage({ imageDataUrl, portions }: PhotoUserMessageInput): MultimodalPart[] {
  const portionLine = portions
    ? `Use portions = ${portions}.`
    : 'If the recipe states a yield, use it; otherwise default to 4 portions.';
  const text = `The attached image is a printed or handwritten recipe. OCR the visible text, then return the SAME JSON schema described in the system message — title, originalYield, ingredients, steps, and analysis.

${portionLine}

If a field is illegible, omit it. Do not invent steps or ingredients you can't see.`;
  return [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: imageDataUrl } },
  ];
}

// ---------------------------------------------------------------------------
// Analyse-existing-recipe prompts. The Editor's "Analyse with AI" button asks
// the LLM for ONLY the analysis subset based on the recipe the user has
// already typed / edited — so calories + tags reflect the current ingredient
// list, not whatever the LLM imagined on first generation.
// ---------------------------------------------------------------------------

export function buildAnalyzeSystemPrompt(): string {
  return `You are a recipe analyzer for ChefFlow. Output a single JSON object — no prose, no markdown fences, no comments.

JSON SCHEMA:
{
  "caloriesPerPortion": <integer kcal — optional>,
  "caloriesTotal": <integer kcal — optional>,
  "keyIngredientTags": [<string array — 2 to 6 lowercase headline-ingredient tags>]
}

CALORIE RULE:
- Compute caloriesTotal first from ingredient masses using standard food composition data.
- Then caloriesPerPortion = round(caloriesTotal / originalYield).
- Both must be integers. If you cannot estimate confidently, omit BOTH fields rather than guessing wildly.

KEY-INGREDIENT TAG RULE:
- 2 to 6 short lowercase tags naming the headline ingredients.
- Skip pantry staples (salt, pepper, water, oil, sugar, flour-as-thickener).
- Use singular nouns. Group obvious variants under one tag.

DO NOT include allergen fields, uncertain-ingredient lists, or any allergen-related output. Allergens are declared exclusively by the chef in the recipe editor.

Return ONLY the JSON object.`;
}

export function buildAnalyzeUserPrompt(recipe: Recipe): string {
  const ingredientLines = recipe.ingredients.length === 0
    ? '(none specified)'
    : recipe.ingredients
        .map((i) => `- ${i.amount} ${i.unit} ${i.name}`.trim())
        .join('\n');
  const stepLines = recipe.steps.length === 0
    ? '(none specified)'
    : recipe.steps.map((s, idx) => `${idx + 1}. ${s.text}`).join('\n');

  return `Title: ${recipe.title || '(untitled)'}
Yield: ${recipe.originalYield} portion${recipe.originalYield === 1 ? '' : 's'}
Ingredients:
${ingredientLines}
Steps:
${stepLines}

Return the analysis JSON for this recipe.`;
}
