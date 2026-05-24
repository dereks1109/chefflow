import { db } from './dexie';
import { randomId } from '../core/util/id';
import type { Recipe, Ingredient, WorkflowStep, StepPhase, KitchenEvent, Dish, RecipeAnalysis } from '../core/types';

// Authorship: the three demo recipes below ("(Demo) Ribeye", "(Demo)
// Garden Salad", "(Demo) Tomato Basil Soup") and the demo event are
// original ChefFlow content. They are not transcribed from any cookbook,
// blog, or other third-party source. Covered by the project's MIT
// license alongside the rest of the codebase (see /THIRD_PARTY_NOTICES.md).

// v5 swaps the legacy single-flag gate for a per-user gate (multiple users
// on the same browser each get their own copy of the demos). Bumping the
// version invalidates any old flag from v3/v4.
const SEED_FLAG_PREFIX = 'chefflow:seeded-demo:';
const EVENTS_SEED_FLAG_PREFIX = 'chefflow:seeded-demo-events:';
const SEED_VERSION = 'v5';

function flagFor(prefix: string, userId: string): string {
  return `${prefix}${userId}:${SEED_VERSION}`;
}

// Per-user demo IDs so two Clerk users on the same browser don't collide on
// `r_demo_ribeye`. Encoded so the result is a safe string but still readable
// in DevTools.
function demoRecipeId(userId: string, slug: string): string {
  return `r_demo_${slug}__${userId}`;
}
function demoDishId(userId: string, slug: string): string {
  return `d_demo_${slug}__${userId}`;
}
function demoEventId(userId: string, slug: string): string {
  return `e_demo_${slug}__${userId}`;
}

function ing(amount: number, unit: string, name: string, locked = false): Ingredient {
  return {
    id: randomId(),
    raw: `{${amount}|${unit}|${name}}`,
    amount,
    unit,
    name,
    isLocked: locked,
  };
}

function step(text: string, phase: StepPhase = 'cook'): WorkflowStep {
  return {
    id: randomId(),
    text,
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOn: [],
    phase,
  };
}

function makeRecipe(
  ownerId: string,
  id: string,
  title: string,
  originalYield: number,
  prepTime: string | undefined,
  cookTime: string | undefined,
  ingredients: Ingredient[],
  steps: WorkflowStep[],
  pricePerPortion: number,
  analysis: Omit<RecipeAnalysis, 'analyzedAt' | 'source'>,
): Recipe {
  const now = Date.now();
  return {
    id,
    title,
    originalYield,
    prepTime,
    cookTime,
    ingredients,
    steps,
    createdAt: now,
    updatedAt: now,
    pricePerPortion,
    analysis: {
      ...analysis,
      analyzedAt: now,
      source: 'manual',
    },
    ownerId,
    serverVersion: 0,
    dirty: true,
  };
}

function demoRecipes(userId: string): Recipe[] {
  return [
    makeRecipe(
      userId,
      demoRecipeId(userId, 'ribeye'),
      '(Demo) Ribeye',
      2,
      '5m',
      '15m',
      [
        ing(700, 'g', 'Rib eye steak'),
        ing(2, 'tsp', 'Sea salt', true),
        ing(1, 'tsp', 'Black pepper', true),
        ing(30, 'g', 'Butter'),
        ing(15, 'g', 'Garlic clove'),
        ing(2, 'g', 'Fresh thyme'),
      ],
      [
        step('Pat steaks dry and season generously with salt and pepper.', 'prep'),
        step('Heat a heavy skillet over high heat until smoking.'),
        step('Sear steaks 2 minutes per side until well browned.'),
        step('Reduce heat, add butter, garlic, and thyme; baste steaks for 1 minute.'),
        step('Rest steaks 5 minutes before slicing against the grain.', 'serve'),
      ],
      15,
      {
        caloriesPerPortion: 880,
        caloriesTotal: 1760,
        keyIngredientTags: ['beef', 'butter', 'garlic'],
        allergens: ['milk'],
      },
    ),
    makeRecipe(
      userId,
      demoRecipeId(userId, 'salad'),
      '(Demo) Garden Salad',
      4,
      '10m',
      undefined,
      [
        ing(200, 'g', 'Mixed salad leaves'),
        ing(150, 'g', 'Cherry tomatoes'),
        ing(200, 'g', 'Cucumber'),
        ing(30, 'ml', 'Olive oil'),
        ing(15, 'ml', 'Lemon juice'),
        ing(2, 'g', 'Sea salt', true),
        ing(1, 'g', 'Black pepper', true),
      ],
      [
        step('Wash salad leaves and pat dry.', 'prep'),
        step('Halve cherry tomatoes; slice cucumber into half-moons.', 'prep'),
        step('Whisk olive oil, lemon juice, salt, and pepper into a dressing.', 'prep'),
        step('Toss leaves, tomatoes, and cucumber with the dressing just before serving.', 'serve'),
      ],
      2.5,
      {
        caloriesPerPortion: 90,
        caloriesTotal: 360,
        keyIngredientTags: ['lettuce', 'tomato', 'cucumber'],
        allergens: [],
      },
    ),
    makeRecipe(
      userId,
      demoRecipeId(userId, 'soup'),
      '(Demo) Tomato Basil Soup',
      4,
      '10m',
      '30m',
      [
        ing(800, 'g', 'Canned tomatoes'),
        ing(150, 'g', 'Yellow onion'),
        ing(15, 'g', 'Garlic clove'),
        ing(500, 'ml', 'Vegetable broth'),
        ing(10, 'g', 'Fresh basil'),
        ing(100, 'ml', 'Heavy cream'),
        ing(15, 'ml', 'Olive oil'),
        ing(3, 'g', 'Salt', true),
        ing(1, 'g', 'Black pepper', true),
      ],
      [
        step('Dice onion and mince garlic.', 'prep'),
        step('Heat olive oil in a pot; sauté onion until soft, about 5 minutes.'),
        step('Add garlic and cook for another minute.'),
        step('Pour in canned tomatoes and broth; simmer 20 minutes.'),
        step('Blend until smooth, then stir in cream and torn basil leaves.', 'serve'),
      ],
      2,
      {
        caloriesPerPortion: 200,
        caloriesTotal: 800,
        keyIngredientTags: ['tomato', 'basil', 'cream'],
        allergens: ['milk'],
      },
    ),
  ];
}

export async function seedDemoRecipes(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const flag = flagFor(SEED_FLAG_PREFIX, userId);
  if (window.localStorage.getItem(flag) === '1') return;
  await db.recipes.bulkPut(demoRecipes(userId));
  window.localStorage.setItem(flag, '1');
}

function demoDish(
  id: string,
  name: string,
  recipeId: string,
  portions: number,
  startAt: Date,
): Dish {
  return {
    id,
    name,
    recipeId,
    portions,
    startAt: startAt.toISOString(),
  };
}

function demoEvents(userId: string): KitchenEvent[] {
  // Local-time construction: 2026-05-14 18:00 in the user's timezone.
  const serve = new Date(2026, 4, 14, 18, 0, 0);
  const ribeyeStart = new Date(2026, 4, 14, 17, 30, 0);
  const saladStart = new Date(2026, 4, 14, 17, 45, 0);
  const now = Date.now();
  // Pinned dish ids so the section buckets below can reference them by id.
  const ribeye = demoDish(
    demoDishId(userId, 'ribeye'),
    '(Demo) Ribeye',
    demoRecipeId(userId, 'ribeye'),
    2,
    ribeyeStart,
  );
  const salad = demoDish(
    demoDishId(userId, 'salad'),
    '(Demo) Garden Salad',
    demoRecipeId(userId, 'salad'),
    4,
    saladStart,
  );
  return [
    {
      id: demoEventId(userId, 'main'),
      title: 'Demo Event',
      serveAt: serve.toISOString(),
      location: 'Home kitchen',
      budget: 50,
      contactName: 'Alex Johnson',
      contactEmail: 'alex@example.com',
      contactPhone: '+44 7700 900123',
      notes: 'Nothing',
      dishes: [ribeye, salad],
      sections: [
        { id: `s_demo_starters__${userId}`, name: 'Starters', dishIds: [salad.id] },
        { id: `s_demo_mains__${userId}`, name: 'Mains', dishIds: [ribeye.id] },
      ],
      createdAt: now,
      updatedAt: now,
      ownerId: userId,
      serverVersion: 0,
      dirty: true,
    },
  ];
}

export async function seedDemoEvents(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const flag = flagFor(EVENTS_SEED_FLAG_PREFIX, userId);
  if (window.localStorage.getItem(flag) === '1') return;
  await db.events.bulkPut(demoEvents(userId));
  window.localStorage.setItem(flag, '1');
}
