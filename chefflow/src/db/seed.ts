import { db } from './dexie';
import { randomId } from '../core/util/id';
import type { Recipe, Ingredient, WorkflowStep, StepPhase, KitchenEvent, Dish } from '../core/types';

const SEED_FLAG = 'chefflow:seeded-demo-v2';
const EVENTS_SEED_FLAG = 'chefflow:seeded-demo-events-v1';

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

function makeRecipe(id: string, title: string, originalYield: number, prepTime: string | undefined, cookTime: string | undefined, ingredients: Ingredient[], steps: WorkflowStep[]): Recipe {
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
      ],
      [
        step('Pat steaks dry and season generously with salt and pepper.', 'prep'),
        step('Heat a heavy skillet over high heat until smoking.'),
        step('Sear steaks 2 minutes per side until well browned.'),
        step('Reduce heat, add butter, garlic, and thyme; baste steaks for 1 minute.'),
        step('Rest steaks 5 minutes before slicing against the grain.', 'serve'),
      ],
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
    ),
  ];
}

export async function seedDemoRecipes(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(SEED_FLAG) === '1') return;
  await db.recipes.bulkPut(demoRecipes());
  window.localStorage.setItem(SEED_FLAG, '1');
}

function demoDish(name: string, recipeId: string, portions: number, startAt: Date): Dish {
  return {
    id: randomId(),
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
  return [
    {
      id: 'e_demo_main',
      title: 'Demo Event',
      serveAt: serve.toISOString(),
      notes: 'Nothing',
      dishes: [
        demoDish('(Demo) Ribeye', 'r_demo_ribeye', 2, ribeyeStart),
        demoDish('(Demo) Garden Salad', 'r_demo_salad', 4, saladStart),
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
