import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRecipe } from './parseRecipe';

const stewMd = readFileSync(
  resolve(__dirname, '../../../tests/fixtures/beef-stew.md'),
  'utf-8'
);

describe('parseRecipe — front matter', () => {
  it('parses title from heading', () => {
    expect(parseRecipe(stewMd).title).toBe('Red Wine Beef Stew');
  });
  it('parses original yield', () => {
    expect(parseRecipe(stewMd).originalYield).toBe(4);
  });
  it('parses prep and cook time', () => {
    const r = parseRecipe(stewMd);
    expect(r.prepTime).toBe('30m');
    expect(r.cookTime).toBe('2h');
  });
  it('uses front-matter recipe_id as id', () => {
    expect(parseRecipe(stewMd).id).toBe('beef-stew-001');
  });
});

describe('parseRecipe — ingredients', () => {
  it('parses 4 ingredients', () => {
    expect(parseRecipe(stewMd).ingredients).toHaveLength(4);
  });
  it('parses amount, unit, name', () => {
    const beef = parseRecipe(stewMd).ingredients[0];
    expect(beef.amount).toBe(800);
    expect(beef.unit).toBe('g');
    expect(beef.name).toBe('Beef Chuck');
    expect(beef.raw).toBe('{800|g|Beef Chuck}');
  });
  it('detects LOCKED marker', () => {
    const salt = parseRecipe(stewMd).ingredients.find(i => i.name === 'Salt');
    expect(salt?.isLocked).toBe(true);
  });
  it('unlocked by default', () => {
    const beef = parseRecipe(stewMd).ingredients[0];
    expect(beef.isLocked).toBe(false);
  });
  it('parses volume units', () => {
    const wine = parseRecipe(stewMd).ingredients.find(i => i.name === 'Red Wine');
    expect(wine?.amount).toBe(250);
    expect(wine?.unit).toBe('ml');
  });
  it('assigns stable ids by 1-based index', () => {
    const ids = parseRecipe(stewMd).ingredients.map(i => i.id);
    expect(ids).toEqual(['i1', 'i2', 'i3', 'i4']);
  });
});
