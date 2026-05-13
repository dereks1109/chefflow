import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRecipe } from './parseRecipe';
import { serializeRecipe } from './serializeRecipe';

const stewMd = readFileSync(
  resolve(__dirname, '../../../tests/fixtures/beef-stew.md'),
  'utf-8'
);

describe('serializeRecipe — round trip', () => {
  it('emits valid markdown that re-parses to an equivalent recipe', () => {
    const r1 = parseRecipe(stewMd);
    const md2 = serializeRecipe(r1);
    const r2 = parseRecipe(md2);
    expect(r2.title).toBe(r1.title);
    expect(r2.originalYield).toBe(r1.originalYield);
    expect(r2.ingredients).toEqual(r1.ingredients);
    // Steps: compare key fields (ids, text, metadata).
    expect(r2.steps.length).toBe(r1.steps.length);
    r1.steps.forEach((s, i) => {
      const t = r2.steps[i];
      expect(t.text).toBe(s.text);
      expect(t.thermalClass).toBe(s.thermalClass);
      expect(t.phase).toBe(s.phase);
      expect(t.dependsOn).toEqual(s.dependsOn);
      expect(t.durationSec).toBe(s.durationSec);
    });
  });

  it('includes LOCKED marker on locked ingredients', () => {
    const r = parseRecipe(stewMd);
    const md = serializeRecipe(r);
    expect(md).toMatch(/\{1\|tsp\|Salt\}\s*\(LOCKED\)/);
  });

  it('omits default step attributes', () => {
    const r = parseRecipe(stewMd);
    const md = serializeRecipe(r);
    // First step is a plain step with all defaults — should not be wrapped in <step>.
    expect(md).toMatch(/^1\.\s+Chop the onions\.$/m);
  });
});

describe('serializeRecipe — custom step ids', () => {
  it('preserves custom step ids through round trip', () => {
    const md = `---
recipe_id: "test"
original_yield: 1
---
# Test
## Ingredients
- [ ] {1|g|Stub}
## Workflow
1. <step id="sear">Sear it.</step>
2. <step depends="sear">Plate it.</step>
`;
    const r1 = parseRecipe(md);
    expect(r1.steps[0].id).toBe('sear');
    expect(r1.steps[1].dependsOn).toEqual(['sear']);

    const md2 = serializeRecipe(r1);
    const r2 = parseRecipe(md2);
    expect(r2.steps[0].id).toBe('sear');
    expect(r2.steps[1].dependsOn).toEqual(['sear']);
  });

  it('omits the id attribute when step id matches default positional id', () => {
    const md = `---
recipe_id: "test"
original_yield: 1
---
# Test
## Ingredients
- [ ] {1|g|Stub}
## Workflow
1. Plain step.
`;
    const r1 = parseRecipe(md);
    expect(r1.steps[0].id).toBe('s1');
    const md2 = serializeRecipe(r1);
    // The serialized form should NOT contain id="s1"
    expect(md2).not.toMatch(/id="s1"/);
  });
});
