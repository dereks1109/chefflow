import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { DEMO_EVENT, DEMO_RECIPES, RIBEYE_RECIPE } from '../__fixtures__/demoEvent';

describe('buildSystemPrompt', () => {
  it('embeds the CulinaryRule.md content verbatim (Rule 1 phrasing present)', () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/<CULINARY_RULES>/);
    expect(s).toMatch(/<\/CULINARY_RULES>/);
    expect(s).toMatch(/The Timeline Rule \(Reverse Engineering\)/);
    expect(s).toMatch(/The Safety & Allergy Isolation Rule/);
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
});
