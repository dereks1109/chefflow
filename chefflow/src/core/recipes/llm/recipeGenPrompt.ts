// ---------------------------------------------------------------------------
// Prompt builders for LLM-assisted recipe creation + analysis.
//
// SYSTEM prompt is constant per build: shape contract + closed allergen
// taxonomy + calorie rule + tagging rule. USER prompt is built fresh per
// call (text mode = dish name; photo mode = caller appends the image part).
// ---------------------------------------------------------------------------

import { ALLERGEN_TAGS, ALLERGEN_LABEL, ALLERGEN_EXAMPLES } from './allergens';
import type { MultimodalPart } from '../../scheduler/llm/groqClient';
import type { Recipe } from '../../types';

function buildAllergenList(): string {
  return ALLERGEN_TAGS
    .map((tag) => `- "${tag}" — ${ALLERGEN_LABEL[tag]} (${ALLERGEN_EXAMPLES[tag]})`)
    .join('\n');
}

export function buildRecipeGenSystemPrompt(): string {
  const allergenList = buildAllergenList();

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
    "keyIngredientTags": [<string array — 2 to 6 lowercase headline-ingredient tags>],
    "allergens": [<closed-set tag array — see ALLERGEN TAGS below>]
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

ALLERGEN TAGS (the closed UK-14 taxonomy — use ONLY these keys):
${allergenList}

ALLERGEN RULE:
- Return ONLY tag keys from the list above.
- If a recipe contains no declarable allergens, return [].
- Do NOT invent new tag keys.
- Tag conservatively: if an ingredient typically contains an allergen (e.g. soy sauce → "soybeans" AND "gluten"), include it.

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
  "keyIngredientTags": [<string array — 2 to 6 lowercase headline-ingredient tags>],
  "allergens": [<closed-set tag array — see ALLERGEN TAGS below>],
  "uncertainIngredients": [<lowercase ingredient-name array — ingredients you cannot confidently classify; safer to flag than to silently skip>]
}

CALORIE RULE:
- Compute caloriesTotal first from ingredient masses using standard food composition data.
- Then caloriesPerPortion = round(caloriesTotal / originalYield).
- Both must be integers. If you cannot estimate confidently, omit BOTH fields rather than guessing wildly.

KEY-INGREDIENT TAG RULE:
- 2 to 6 short lowercase tags naming the headline ingredients.
- Skip pantry staples (salt, pepper, water, oil, sugar, flour-as-thickener).
- Use singular nouns. Group obvious variants under one tag.

ALLERGEN TAGS (the closed UK-14 taxonomy — use ONLY these keys):
${buildAllergenList()}

ALLERGEN RULE:
- Return ONLY tag keys from the list above.
- If a recipe contains no declarable allergens, return [].
- Tag conservatively: if an ingredient typically contains an allergen, include it.

UNCERTAIN RULE:
- If you cannot confidently say whether a specific ingredient contains any UK-14 allergen — common cases: brand-specific products ("house chilli paste", "Acme XO sauce"), fusion/regional staples you have not seen before, vague descriptors ("seasonal greens"), or anything obscure — list that ingredient's EXACT lowercase name in "uncertainIngredients".
- Do NOT also add it to "allergens" — uncertain ingredients are the chef's responsibility to verify.
- "uncertainIngredients" is for AI uncertainty ONLY, never for ingredients that you are confident about.
- Use the ingredient name verbatim from the recipe (lowercase). Do NOT paraphrase. Example: if the recipe lists "House Chilli Paste", emit "house chilli paste".
- If you are confident about every ingredient, return [] (or omit the field).

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
