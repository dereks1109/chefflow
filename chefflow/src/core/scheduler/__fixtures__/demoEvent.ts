// Test fixture — a frozen snapshot of the demo event + its two recipes.
// Kept independent of db/seed.ts (which uses Date.now() and Dexie at runtime)
// so the scheduler can be tested deterministically.
import type { KitchenEvent, Recipe, Ingredient, WorkflowStep, StepPhase } from '../../types';

const SERVE_ISO = '2026-05-14T18:00:00.000Z';

// Helpers ---------------------------------------------------------------
function ing(id: string, amount: number, unit: string, name: string, locked = false): Ingredient {
  return {
    id,
    raw: `{${amount}|${unit}|${name}}`,
    amount,
    unit,
    name,
    isLocked: locked,
  };
}

function step(
  id: string,
  text: string,
  phase: StepPhase = 'cook',
  overrides: Partial<WorkflowStep> = {},
): WorkflowStep {
  return {
    id,
    text,
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOn: [],
    phase,
    ...overrides,
  };
}

// Recipes ---------------------------------------------------------------
export const RIBEYE_RECIPE: Recipe = {
  id: 'r_demo_ribeye',
  title: '(Demo) Ribeye',
  originalYield: 2,
  prepTime: '5m',
  cookTime: '15m',
  ingredients: [
    ing('i1', 700, 'g', 'Rib eye steak'),
    ing('i2', 2, 'tsp', 'Sea salt', true),
    ing('i3', 1, 'tsp', 'Black pepper', true),
    ing('i4', 30, 'g', 'Butter'),
    ing('i5', 15, 'g', 'Garlic clove'),
    ing('i6', 2, 'g', 'Fresh thyme'),
  ],
  steps: [
    step('rs1', 'Pat steaks dry and season generously with salt and pepper.', 'prep', {
      durationSec: 120,
    }),
    step('rs2', 'Heat a heavy skillet over high heat until smoking.', 'cook', {
      durationSec: 120,
    }),
    step('rs3', 'Sear steaks 2 minutes per side until well browned.', 'cook', {
      durationSec: 240,
    }),
    step('rs4', 'Reduce heat, add butter, garlic, and thyme; baste steaks for 1 minute.', 'cook', {
      durationSec: 60,
    }),
    step('rs5', 'Rest steaks 5 minutes before slicing against the grain.', 'serve', {
      durationSec: 300,
      kind: 'passive',
    }),
  ],
  createdAt: 0,
  updatedAt: 0,
};

export const SALAD_RECIPE: Recipe = {
  id: 'r_demo_salad',
  title: '(Demo) Garden Salad',
  originalYield: 4,
  prepTime: '10m',
  ingredients: [
    ing('si1', 200, 'g', 'Mixed salad leaves'),
    ing('si2', 150, 'g', 'Cherry tomatoes'),
    ing('si3', 200, 'g', 'Cucumber'),
    ing('si4', 30, 'ml', 'Olive oil'),
    ing('si5', 15, 'ml', 'Lemon juice'),
    ing('si6', 2, 'g', 'Sea salt', true),
    ing('si7', 1, 'g', 'Black pepper', true),
  ],
  steps: [
    step('ss1', 'Wash salad leaves and pat dry.', 'prep', { durationSec: 300 }),
    step('ss2', 'Halve cherry tomatoes; slice cucumber into half-moons.', 'prep', { durationSec: 120 }),
    step('ss3', 'Whisk olive oil, lemon juice, salt, and pepper into a dressing.', 'prep', {
      durationSec: 60,
    }),
    step('ss4', 'Toss leaves, tomatoes, and cucumber with the dressing just before serving.', 'serve', {
      durationSec: 120,
      thermalClass: 'flash',
    }),
  ],
  createdAt: 0,
  updatedAt: 0,
};

// Event -----------------------------------------------------------------
export const DEMO_EVENT: KitchenEvent = {
  id: 'e_demo_main',
  title: 'Demo Event',
  serveAt: SERVE_ISO,
  notes: 'Nothing',
  dishes: [
    {
      id: 'd_ribeye',
      name: '(Demo) Ribeye',
      recipeId: 'r_demo_ribeye',
      portions: 2,
      startAt: '2026-05-14T17:30:00.000Z',
    },
    {
      id: 'd_salad',
      name: '(Demo) Garden Salad',
      recipeId: 'r_demo_salad',
      portions: 4,
      startAt: '2026-05-14T17:45:00.000Z',
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};

export const DEMO_RECIPES: Map<string, Recipe> = new Map([
  [RIBEYE_RECIPE.id, RIBEYE_RECIPE],
  [SALAD_RECIPE.id, SALAD_RECIPE],
]);
