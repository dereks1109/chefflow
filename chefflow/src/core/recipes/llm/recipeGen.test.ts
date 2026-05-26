import { describe, it, expect, vi } from 'vitest';
import {
  generateRecipeFromText,
  generateRecipeFromPhoto,
  analyzeRecipe,
  LlmRecipeValidationError,
  VISION_MODEL,
} from './recipeGen';
import type { Recipe } from '../../types';

function fetchReturning(content: string): typeof fetch {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ) as unknown as typeof fetch;
}

const llmOk = JSON.stringify({
  title: 'Beef Bourguignon',
  originalYield: 4,
  prepTime: '30 min',
  cookTime: '3 hr',
  ingredients: [
    { amount: 800, unit: 'g', name: 'beef chuck' },
    { amount: 200, unit: 'ml', name: 'red wine' },
  ],
  steps: [
    { text: 'Sear beef', durationSec: 600, phase: 'cook' },
    { text: 'Simmer', durationSec: 7200, phase: 'cook' },
  ],
  analysis: {
    caloriesPerPortion: 612,
    caloriesTotal: 2448,
    keyIngredientTags: ['beef', 'red wine'],
    allergens: ['sulphites'],
  },
});

describe('generateRecipeFromText', () => {
  it('returns a fully populated Recipe with analysis source=llm-text', async () => {
    const recipe = await generateRecipeFromText({
      dish: 'Beef Bourguignon',
      portions: 4,
      apiKey: 'k',
      model: 'llama-3.3-70b-versatile',
      fetchImpl: fetchReturning(llmOk),
    });
    expect(recipe.title).toBe('Beef Bourguignon');
    expect(recipe.originalYield).toBe(4);
    expect(recipe.ingredients).toHaveLength(2);
    expect(recipe.ingredients[0].id).toBe('i1');
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.steps[0].id).toBe('s1');
    expect(recipe.analysis?.source).toBe('llm-text');
    // The LLM no longer populates allergens (user-declared only). Even when
    // the model emits an `allergens` field the validator drops it.
    expect(recipe.analysis?.allergens).toBeUndefined();
    expect(recipe.analysis?.analyzedAt).toBeGreaterThan(0);
    expect(recipe.id).toMatch(/^r_/);
  });

  it('throws LlmRecipeValidationError on malformed JSON', async () => {
    await expect(
      generateRecipeFromText({
        dish: 'X',
        apiKey: 'k',
        model: 'm',
        fetchImpl: fetchReturning('not json {'),
      }),
    ).rejects.toBeInstanceOf(LlmRecipeValidationError);
  });

  it('throws LlmRecipeValidationError when required fields are missing', async () => {
    const bad = JSON.stringify({ title: 'X', originalYield: 4, ingredients: [], steps: [] });
    await expect(
      generateRecipeFromText({
        dish: 'X',
        apiKey: 'k',
        model: 'm',
        fetchImpl: fetchReturning(bad),
      }),
    ).rejects.toBeInstanceOf(LlmRecipeValidationError);
  });

  it('tolerates markdown-fenced JSON', async () => {
    const fenced = '```json\n' + llmOk + '\n```';
    const recipe = await generateRecipeFromText({
      dish: 'X',
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchReturning(fenced),
    });
    expect(recipe.title).toBe('Beef Bourguignon');
  });
});

describe('analyzeRecipe', () => {
  const sampleRecipe: Recipe = {
    id: 'r_test',
    title: 'Bourguignon',
    originalYield: 4,
    ingredients: [
      { id: 'i1', raw: '{800|g|beef}', amount: 800, unit: 'g', name: 'beef chuck', isLocked: false },
    ],
    steps: [
      { id: 's1', text: 'Sear', kind: 'active', thermalClass: 'normal', allergenClass: 'allergen-free', dependsOn: [], phase: 'cook' },
    ],
    createdAt: 0,
    updatedAt: 0,
  };

  it('returns a RecipeAnalysis with source=llm-text stamped (calories + key tags only)', async () => {
    const json = JSON.stringify({
      caloriesPerPortion: 600,
      caloriesTotal: 2400,
      keyIngredientTags: ['beef', 'red wine'],
    });
    const analysis = await analyzeRecipe({
      recipe: sampleRecipe,
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchReturning(json),
    });
    expect(analysis.caloriesPerPortion).toBe(600);
    expect(analysis.caloriesTotal).toBe(2400);
    expect(analysis.keyIngredientTags).toEqual(['beef', 'red wine']);
    expect(analysis.allergens).toBeUndefined();
    expect(analysis.source).toBe('llm-text');
    expect(analysis.analyzedAt).toBeGreaterThan(0);
  });

  it('tolerates an empty analysis response (everything degrades to empty / undefined)', async () => {
    const analysis = await analyzeRecipe({
      recipe: sampleRecipe,
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchReturning('{}'),
    });
    expect(analysis.allergens).toBeUndefined();
    expect(analysis.keyIngredientTags).toEqual([]);
    expect(analysis.caloriesPerPortion).toBeUndefined();
  });

  it('strips markdown fences before parsing', async () => {
    const fenced = '```json\n{"keyIngredientTags":["beef"],"allergens":[]}\n```';
    const analysis = await analyzeRecipe({
      recipe: sampleRecipe,
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchReturning(fenced),
    });
    expect(analysis.keyIngredientTags).toEqual(['beef']);
  });

  it('throws LlmRecipeValidationError on totally invalid JSON', async () => {
    await expect(
      analyzeRecipe({
        recipe: sampleRecipe,
        apiKey: 'k',
        model: 'm',
        fetchImpl: fetchReturning('not json {'),
      }),
    ).rejects.toBeInstanceOf(LlmRecipeValidationError);
  });

  it('ignores any allergens or uncertainIngredients fields the LLM might still emit (legal de-risk)', async () => {
    // The model is no longer asked to produce allergens, but a stale or
    // off-spec response might include them. Both fields must be silently
    // discarded so they never become user-visible allergen claims.
    const json = JSON.stringify({
      keyIngredientTags: ['beef'],
      allergens: ['milk', 'gluten'],
      uncertainIngredients: ['house chilli paste'],
    });
    const analysis = await analyzeRecipe({
      recipe: sampleRecipe,
      apiKey: 'k',
      model: 'm',
      fetchImpl: fetchReturning(json),
    });
    expect((analysis as { allergens?: unknown }).allergens).toBeUndefined();
    expect((analysis as { uncertainIngredients?: unknown }).uncertainIngredients).toBeUndefined();
    expect(analysis.keyIngredientTags).toEqual(['beef']);
  });
});

describe('generateRecipeFromPhoto', () => {
  it('sends a multimodal message with the image data URL and defaults to VISION_MODEL', async () => {
    let capturedBody: unknown;
    const fetchImpl = vi.fn((..._args: unknown[]) => {
      const [, init] = _args as [string, RequestInit];
      capturedBody = JSON.parse(init.body as string);
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: llmOk } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;

    const recipe = await generateRecipeFromPhoto({
      imageDataUrl: 'data:image/png;base64,AAA',
      portions: 4,
      apiKey: 'k',
      fetchImpl,
    });

    expect(recipe.analysis?.source).toBe('llm-vision');
    const body = capturedBody as { model: string; messages: Array<{ role: string; content: unknown }> };
    expect(body.model).toBe(VISION_MODEL);
    const userMsg = body.messages[1];
    expect(userMsg.role).toBe('user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    const parts = userMsg.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.find((p) => p.type === 'image_url')?.image_url?.url).toBe('data:image/png;base64,AAA');
  });
});
