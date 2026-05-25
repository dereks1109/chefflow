import { describe, it, expect } from 'vitest';
import { filterRecipes } from './recipeSearch';
import type { Recipe, Ingredient } from '../types';

function ing(name: string): Ingredient {
  return {
    id: `i_${name}`,
    raw: `{1|g|${name}}`,
    amount: 1,
    unit: 'g',
    name,
    isLocked: false,
  };
}

function recipe(overrides: Partial<Recipe> & { id: string; title: string }): Recipe {
  return {
    originalYield: 1,
    ingredients: [],
    steps: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const stew = recipe({
  id: 'r1',
  title: 'Beef Stew',
  ingredients: [ing('Beef Chuck'), ing('Carrots')],
  analysis: { keyIngredientTags: ['beef', 'root vegetable'], allergens: ['celery'] },
});

const cake = recipe({
  id: 'r2',
  title: 'Chocolate Cake',
  ingredients: [ing('Cocoa'), ing('Flour')],
  analysis: { keyIngredientTags: ['chocolate'], allergens: ['gluten', 'eggs'] },
});

const plain = recipe({ id: 'r3', title: 'Plain Rice', ingredients: [ing('Rice')] });

const corpus = [stew, cake, plain];

describe('filterRecipes', () => {
  it('returns the input list unchanged when the query is empty', () => {
    expect(filterRecipes(corpus, '')).toEqual(corpus);
  });

  it('returns the input list unchanged when the query is whitespace-only', () => {
    expect(filterRecipes(corpus, '   ')).toEqual(corpus);
  });

  it('matches against recipe title', () => {
    const out = filterRecipes(corpus, 'cake');
    expect(out).toEqual([cake]);
  });

  it('matches against an ingredient name', () => {
    const out = filterRecipes(corpus, 'cocoa');
    expect(out).toEqual([cake]);
  });

  it('matches against an analysis key-ingredient tag', () => {
    const out = filterRecipes(corpus, 'root');
    expect(out).toEqual([stew]);
  });

  it('matches against an allergen tag', () => {
    const out = filterRecipes(corpus, 'gluten');
    expect(out).toEqual([cake]);
  });

  it('is case-insensitive', () => {
    expect(filterRecipes(corpus, 'BEEF')).toEqual([stew]);
    expect(filterRecipes(corpus, 'bEeF cHuCk')).toEqual([stew]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterRecipes(corpus, 'xyznothing')).toEqual([]);
  });
});
