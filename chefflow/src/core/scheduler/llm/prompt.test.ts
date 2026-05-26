import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { DEMO_EVENT, DEMO_RECIPES, RIBEYE_RECIPE } from '../__fixtures__/demoEvent';

describe('buildSystemPrompt', () => {
  it('embeds the CulinaryRule.md content verbatim (Rule 1 + the new Rules 7–10 present)', () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/<CULINARY_RULES>/);
    expect(s).toMatch(/<\/CULINARY_RULES>/);
    expect(s).toMatch(/Rule 1: Timeline \(Reverse Engineering\)/);
    expect(s).toMatch(/Rule 5: Safety & Allergen Isolation/);
    // The four new rules added in this revision:
    expect(s).toMatch(/Rule 7: Chef Team Parallelism/);
    expect(s).toMatch(/Rule 8: Equipment Scheduling/);
    expect(s).toMatch(/Rule 9: Plating & Service Window/);
    expect(s).toMatch(/Rule 10: Buffer & Critical Path/);
  });

  it('documents the WARNINGS conventions so the LLM emits parseable strings', () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/WARNINGS CONVENTIONS/);
    expect(s).toMatch(/critical path:/);
    expect(s).toMatch(/FIRE — plating begins/);
    expect(s).toMatch(/oven contention/);
  });

  it('widens rulesApplied to 1..10 (was 1..6)', () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/rulesApplied lists the rule numbers \(1\.\.10/);
    expect(s).not.toMatch(/rule numbers \(1\.\.6/);
  });

  it('spells out the JSON output contract', () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/"steps"/);
    expect(s).toMatch(/stepId/);
    expect(s).toMatch(/rulesApplied/);
    expect(s).toMatch(/Return ONLY the JSON/);
  });

  it('lists the hard constraints (last step ends at serveAt, +duration === endAt)', () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/last step.*endAt MUST exactly equal/i);
    expect(s).toMatch(/startAt \+ durationSec\*1000 === endAt/);
  });
});

describe('buildUserPrompt', () => {
  it('includes the event id / title / serveAt', () => {
    const p = buildUserPrompt(DEMO_EVENT, DEMO_RECIPES);
    expect(p).toContain('"e_demo_main"');
    expect(p).toContain('"Demo Event"');
    expect(p).toContain('"2026-05-14T18:00:00.000Z"');
  });

  it('includes each dish with its recipeId + portions + isPrepared boolean', () => {
    const p = buildUserPrompt(DEMO_EVENT, DEMO_RECIPES);
    expect(p).toContain('"d_ribeye"');
    expect(p).toContain('"r_demo_ribeye"');
    expect(p).toContain('"isPrepared": false');
  });

  it('only includes recipes referenced by the event\'s dishes', () => {
    // The Demo Event references ribeye and salad. Tomato Soup (also in
    // DEMO_RECIPES via seed) is NOT referenced and must not bloat the prompt.
    const ribeyeOnly = new Map([[RIBEYE_RECIPE.id, RIBEYE_RECIPE]]);
    const p = buildUserPrompt(DEMO_EVENT, ribeyeOnly);
    expect(p).toContain('"r_demo_ribeye"');
    expect(p).not.toContain('Tomato Basil');
  });

  it('omits the salad recipe when the salad dish is removed', () => {
    const event = { ...DEMO_EVENT, dishes: [DEMO_EVENT.dishes[0]] };  // ribeye only
    const p = buildUserPrompt(event, DEMO_RECIPES);
    expect(p).toContain('"r_demo_ribeye"');
    expect(p).not.toContain('"r_demo_salad"');
  });

  it('asks the model to produce the workflow JSON now', () => {
    const p = buildUserPrompt(DEMO_EVENT, DEMO_RECIPES);
    expect(p).toMatch(/Produce the workflow JSON now/);
  });

  it('passes through event-level numberOfGuests + notes for the LLM to consider (Rule 5/9 dietary signal)', () => {
    const event = { ...DEMO_EVENT, numberOfGuests: 12, notes: 'guest with peanut allergy' };
    const p = buildUserPrompt(event, DEMO_RECIPES);
    expect(p).toContain('"numberOfGuests": 12');
    expect(p).toContain('guest with peanut allergy');
  });

  it('passes through dish.colorTag so Rule 7 (chef parallelism) has chef-assignment input', () => {
    const event = {
      ...DEMO_EVENT,
      dishes: DEMO_EVENT.dishes.map((d, i) => ({ ...d, colorTag: (i === 0 ? 'red' : 'green') as 'red' | 'green' })),
    };
    const p = buildUserPrompt(event, DEMO_RECIPES);
    expect(p).toContain('"colorTag": "red"');
    expect(p).toContain('"colorTag": "green"');
  });
});
