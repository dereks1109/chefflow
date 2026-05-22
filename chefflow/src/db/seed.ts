import { db } from './dexie';
import { randomId } from '../core/util/id';
import type { Recipe, Ingredient, WorkflowStep, StepPhase, KitchenEvent, Dish, RecipeAnalysis } from '../core/types';
// Vite's ?inline bakes these JPEGs into the bundle as base64 data URLs so the
// demo recipes seed with cover photos without standing up object storage.
import ribeyePhoto from '../assets/demo/ribeye.jpeg?inline';
import saladPhoto from '../assets/demo/salad.jpeg?inline';
import soupPhoto from '../assets/demo/tomatosoup.jpeg?inline';
import pepperSaucePhoto from '../assets/demo/pepper-sauce.jpeg?inline';

// Bump when demo recipe content changes — existing IndexedDB copies are
// overwritten on next load so chefs see the new fields. v6 adds a cover
// photo to (Demo) Black Pepper Sauce — v5 introduced the recipe but
// shipped without a photo placeholder.
const SEED_FLAG = 'chefflow:seeded-demo-v6';
// v6 scales the demo event 10× (8 → 80 covers) — actually we keep
// numberOfGuests=8 and scale per-dish portions 10×. Also adds realistic
// notes covering allergies + budget so the menu-suitability analysis has
// something to chew on.
const EVENTS_SEED_FLAG = 'chefflow:seeded-demo-events-v6';

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

/** Build an ingredient line that references another recipe (sub-recipe). */
function ingComponent(amount: number, unit: string, recipeId: string, displayTitle: string): Ingredient {
  const name = `#${displayTitle}`;
  return {
    id: randomId(),
    raw: `{${amount}|${unit}|${name}}`,
    amount,
    unit,
    name,
    isLocked: false,
    componentRecipeId: recipeId,
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
  id: string,
  title: string,
  originalYield: number,
  prepTime: string | undefined,
  cookTime: string | undefined,
  ingredients: Ingredient[],
  steps: WorkflowStep[],
  pricePerPortion: number,
  analysis: Omit<RecipeAnalysis, 'analyzedAt' | 'source'>,
  coverPhoto: string,
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
    coverPhoto,
    analysis: {
      ...analysis,
      analyzedAt: now,
      source: 'manual',
    },
  };
}

function demoRecipes(): Recipe[] {
  return [
    makeRecipe(
      'r_demo_ribeye',
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
        ingComponent(80, 'ml', 'r_demo_pepper_sauce', '(Demo) Black Pepper Sauce'),
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
      ribeyePhoto,
    ),
    makeRecipe(
      'r_demo_salad',
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
      saladPhoto,
    ),
    makeRecipe(
      'r_demo_soup',
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
      soupPhoto,
    ),
    makeRecipe(
      'r_demo_pepper_sauce',
      '(Demo) Black Pepper Sauce',
      4,
      '5m',
      '15m',
      [
        ing(1, 'tbsp', 'Butter'),
        ing(30, 'g', 'Shallot'),
        ing(15, 'g', 'Cracked black peppercorns'),
        ing(15, 'ml', 'Brandy'),
        ing(200, 'ml', 'Beef stock'),
        ing(200, 'ml', 'Double cream'),
        ing(1, 'g', 'Sea salt', true),
      ],
      [
        step('Finely dice the shallot. Crack the peppercorns coarsely with a pestle and mortar.', 'prep'),
        step('Melt butter in a small saucepan; sweat shallot 2–3 minutes until soft, not browned.'),
        step('Add the cracked peppercorns; toast briefly to release their oils, ~30 seconds.'),
        step('Pour in brandy and let it bubble off, then add beef stock; reduce by half.'),
        step('Stir in the double cream; simmer until the sauce coats the back of a spoon. Season with salt.', 'serve'),
      ],
      2,
      {
        caloriesPerPortion: 220,
        caloriesTotal: 880,
        keyIngredientTags: ['black pepper', 'cream', 'shallot'],
        allergens: ['milk'],
      },
      pepperSaucePhoto,
    ),
  ];
}

export async function seedDemoRecipes(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(SEED_FLAG) === '1') return;
  await db.recipes.bulkPut(demoRecipes());
  window.localStorage.setItem(SEED_FLAG, '1');
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

function demoEvents(): KitchenEvent[] {
  // Local-time construction: 2026-05-14 18:00 in the user's timezone.
  const serve = new Date(2026, 4, 14, 18, 0, 0);
  const ribeyeStart = new Date(2026, 4, 14, 17, 30, 0);
  const saladStart = new Date(2026, 4, 14, 17, 45, 0);
  const now = Date.now();
  // Pinned dish ids so the section buckets below can reference them by id.
  // Portions are 10× the recipe's originalYield to demo a larger event
  // (Ribeye recipe yields 2 → 20 portions; Garden Salad yields 4 → 40).
  const ribeye = demoDish('d_demo_ribeye', '(Demo) Ribeye', 'r_demo_ribeye', 20, ribeyeStart);
  const salad = demoDish('d_demo_salad', '(Demo) Garden Salad', 'r_demo_salad', 40, saladStart);
  return [
    {
      id: 'e_demo_main',
      title: 'Demo Event',
      serveAt: serve.toISOString(),
      location: 'Home kitchen',
      budget: 50,
      numberOfGuests: 8,
      contactName: 'Alex Johnson',
      contactEmail: 'alex@example.com',
      contactPhone: '+44 7700 900123',
      // Realistic notes so the menu-suitability analysis has signal to
      // reason about: dietary requirements + budget context. Adjust freely
      // in the editor on chefflow.uk to test other scenarios.
      notes: [
        '8 guests for a birthday dinner.',
        'Anna and Ben are vegetarian (no meat or fish).',
        'Carla has a confirmed peanut allergy — strict.',
        'Dave (birthday) loves a classic steak with peppercorn sauce.',
        'Budget is tight — try to come in around £50 total food cost.',
        'Casual ambience, no formal courses needed.',
      ].join('\n'),
      dishes: [ribeye, salad],
      sections: [
        { id: 's_demo_starters', name: 'Starters', dishIds: [salad.id] },
        { id: 's_demo_mains', name: 'Mains', dishIds: [ribeye.id] },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export async function seedDemoEvents(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(EVENTS_SEED_FLAG) === '1') return;
  await db.events.bulkPut(demoEvents());
  window.localStorage.setItem(EVENTS_SEED_FLAG, '1');
}
