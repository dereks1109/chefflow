import { describe, it, expect } from 'vitest';
import {
  buildRecipeGenSystemPrompt,
  buildTextUserPrompt,
  buildPhotoUserMessage,
  buildAnalyzeSystemPrompt,
  buildAnalyzeUserPrompt,
} from './recipeGenPrompt';
import { ALLERGEN_TAGS, ALLERGEN_LABEL } from './allergens';
import type { Recipe } from '../../types';

describe('buildRecipeGenSystemPrompt', () => {
  const prompt = buildRecipeGenSystemPrompt();

  it('enumerates every UK-14 allergen tag', () => {
    for (const tag of ALLERGEN_TAGS) {
      expect(prompt).toContain(`"${tag}"`);
    }
  });

  it('includes the human label for every allergen', () => {
    for (const tag of ALLERGEN_TAGS) {
      expect(prompt).toContain(ALLERGEN_LABEL[tag]);
    }
  });

  it('forbids inventing new tag keys', () => {
    expect(prompt).toMatch(/Do NOT invent new tag keys/);
  });

  it('spells out the calorie computation rule', () => {
    expect(prompt).toMatch(/caloriesTotal/);
    expect(prompt).toMatch(/caloriesPerPortion/);
    expect(prompt).toMatch(/integers?/i);
  });

  it('demands JSON-only output with no markdown fences', () => {
    expect(prompt).toMatch(/no markdown fences/i);
  });
});

describe('buildTextUserPrompt', () => {
  it('embeds the dish name and the portion count', () => {
    const out = buildTextUserPrompt({ dish: 'Beef Bourguignon', portions: 6 });
    expect(out).toContain('Beef Bourguignon');
    expect(out).toContain('6');
  });

  it('falls back to a sensible default when portions are omitted', () => {
    const out = buildTextUserPrompt({ dish: 'Carbonara' });
    expect(out).toContain('Carbonara');
    expect(out).toMatch(/sensible default|typically 4/i);
  });

  it('trims whitespace around the dish name', () => {
    const out = buildTextUserPrompt({ dish: '   Pad Thai\n' });
    expect(out).toContain('Dish: Pad Thai');
  });
});

describe('buildPhotoUserMessage', () => {
  it('produces a text + image_url pair', () => {
    const parts = buildPhotoUserMessage({
      imageDataUrl: 'data:image/png;base64,AAA',
      portions: 4,
    });
    expect(parts).toHaveLength(2);
    expect(parts[0].type).toBe('text');
    expect(parts[1].type).toBe('image_url');
    expect(parts[1]).toMatchObject({
      image_url: { url: 'data:image/png;base64,AAA' },
    });
  });

  it('tells the LLM not to invent illegible content', () => {
    const parts = buildPhotoUserMessage({ imageDataUrl: 'data:image/png;base64,X' });
    const text = parts[0].type === 'text' ? parts[0].text : '';
    expect(text).toMatch(/OCR/);
    expect(text).toMatch(/do not invent/i);
  });
});

const fakeRecipe: Recipe = {
  id: 'r_test',
  title: 'Beef Bourguignon',
  originalYield: 4,
  ingredients: [
    { id: 'i1', raw: '{800|g|beef chuck}', amount: 800, unit: 'g', name: 'beef chuck', isLocked: false },
    { id: 'i2', raw: '{200|ml|red wine}', amount: 200, unit: 'ml', name: 'red wine', isLocked: false },
  ],
  steps: [
    { id: 's1', text: 'Sear beef', kind: 'active', thermalClass: 'normal', allergenClass: 'allergen-free', dependsOn: [], phase: 'cook' },
  ],
  createdAt: 0,
  updatedAt: 0,
};

describe('buildAnalyzeSystemPrompt', () => {
  it('lists every UK-14 allergen', () => {
    const prompt = buildAnalyzeSystemPrompt();
    for (const tag of ALLERGEN_TAGS) {
      expect(prompt).toContain(`"${tag}"`);
      expect(prompt).toContain(ALLERGEN_LABEL[tag]);
    }
  });

  it('asks only for the analysis subset (no title/ingredients fields)', () => {
    const prompt = buildAnalyzeSystemPrompt();
    expect(prompt).toContain('caloriesPerPortion');
    expect(prompt).toContain('allergens');
    expect(prompt).not.toMatch(/"title":/);
    expect(prompt).not.toMatch(/"ingredients":/);
  });
});

describe('buildAnalyzeUserPrompt', () => {
  it('includes title, yield, every ingredient, every step', () => {
    const out = buildAnalyzeUserPrompt(fakeRecipe);
    expect(out).toContain('Title: Beef Bourguignon');
    expect(out).toContain('4 portions');
    expect(out).toContain('800 g beef chuck');
    expect(out).toContain('200 ml red wine');
    expect(out).toContain('1. Sear beef');
  });

  it('handles a recipe with zero ingredients or steps gracefully', () => {
    const empty: Recipe = { ...fakeRecipe, ingredients: [], steps: [] };
    const out = buildAnalyzeUserPrompt(empty);
    expect(out).toMatch(/none specified/i);
  });
});
