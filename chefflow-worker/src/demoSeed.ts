// Canonical demo recipes + event served to every user on first sign-in.
//
// Mirrors the legacy SPA seed at chefflow/src/db/seed.ts. The SPA seed is
// being retired — this file is now the source of truth. Cover photos stay
// in the SPA bundle (chefflow/src/assets/demo/ + chefflow/src/core/demos/
// demoPhotoMap.ts); the worker writes recipes with an empty coverPhoto and
// the SPA fills it in at render time using the stable demo id.
//
// Loose typing on purpose. The worker doesn't import the SPA's `Recipe`
// type (separate package, separate tsconfig) — we generate JSON that matches
// the SPA's shape and the SPA's existing sync read path consumes it without
// any extra normalization.

type Ingredient = {
  id: string;
  raw: string;
  amount: number;
  unit: string;
  name: string;
  isLocked: boolean;
  componentRecipeId?: string;
};

type WorkflowStep = {
  id: string;
  text: string;
  kind: 'active';
  thermalClass: 'normal';
  allergenClass: 'allergen-free';
  dependsOn: [];
  phase: 'prep' | 'cook' | 'serve';
};

type Analysis = {
  caloriesPerPortion: number;
  caloriesTotal: number;
  keyIngredientTags: string[];
  analyzedAt: number;
  source: 'manual';
};

export type DemoRecipe = {
  id: string;
  title: string;
  originalYield: number;
  prepTime?: string;
  cookTime?: string;
  ingredients: Ingredient[];
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
  pricePerPortion: number;
  coverPhoto: string;
  description?: string;
  analysis: Analysis;
};

export type DemoEvent = {
  id: string;
  title: string;
  serveAt: string;
  location: string;
  budget: number;
  numberOfGuests: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  dishes: Array<{ id: string; name: string; recipeId: string; portions: number; startAt: string }>;
  sections: Array<{ id: string; name: string; dishIds: string[] }>;
  createdAt: number;
  updatedAt: number;
};

// Deterministic id minter keyed by recipe id, so re-runs produce the same
// ingredient + step ids — important for INSERT OR IGNORE semantics and so a
// user's edits stay anchored to stable handles.
function idFor(recipeKey: string, kind: string, n: number): string {
  return `${kind}_${recipeKey}_${n}`;
}

interface IngArgs { amount: number; unit: string; name: string; locked?: boolean; componentRecipeId?: string }

function buildRecipe(args: {
  id: string;
  title: string;
  originalYield: number;
  prepTime?: string;
  cookTime?: string;
  ingredients: IngArgs[];
  steps: Array<{ text: string; phase?: WorkflowStep['phase'] }>;
  pricePerPortion: number;
  analysis: Omit<Analysis, 'analyzedAt' | 'source'>;
  description?: string;
  now: number;
}): DemoRecipe {
  const key = args.id.replace(/^r_demo_/, '');
  const ingredients: Ingredient[] = args.ingredients.map((i, idx) => {
    const displayName = i.componentRecipeId ? `@${i.name}` : i.name;
    return {
      id: idFor(key, 'ing', idx + 1),
      raw: `{${i.amount}|${i.unit}|${displayName}}`,
      amount: i.amount,
      unit: i.unit,
      name: displayName,
      isLocked: i.locked === true,
      ...(i.componentRecipeId ? { componentRecipeId: i.componentRecipeId } : {}),
    };
  });
  const steps: WorkflowStep[] = args.steps.map((s, idx) => ({
    id: idFor(key, 'step', idx + 1),
    text: s.text,
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOn: [],
    phase: s.phase ?? 'cook',
  }));
  return {
    id: args.id,
    title: args.title,
    originalYield: args.originalYield,
    ...(args.prepTime ? { prepTime: args.prepTime } : {}),
    ...(args.cookTime ? { cookTime: args.cookTime } : {}),
    ingredients,
    steps,
    createdAt: args.now,
    updatedAt: args.now,
    pricePerPortion: args.pricePerPortion,
    // Empty: SPA enriches via demoPhotoMap at render time.
    coverPhoto: '',
    ...(args.description ? { description: args.description } : {}),
    analysis: {
      ...args.analysis,
      analyzedAt: args.now,
      source: 'manual',
    },
  };
}

export function buildDemoRecipes(now: number): DemoRecipe[] {
  return [
    buildRecipe({
      id: 'r_demo_ribeye', title: '(Demo) Ribeye', originalYield: 2,
      prepTime: '5m', cookTime: '15m',
      ingredients: [
        { amount: 700, unit: 'g', name: 'Rib eye steak' },
        { amount: 2, unit: 'tsp', name: 'Sea salt', locked: true },
        { amount: 1, unit: 'tsp', name: 'Black pepper', locked: true },
        { amount: 30, unit: 'g', name: 'Butter' },
        { amount: 15, unit: 'g', name: 'Garlic clove' },
        { amount: 2, unit: 'g', name: 'Fresh thyme' },
        { amount: 80, unit: 'ml', name: '(Demo) Black Pepper Sauce', componentRecipeId: 'r_demo_pepper_sauce' },
      ],
      steps: [
        { text: 'Pat steaks dry and season generously with salt and pepper.', phase: 'prep' },
        { text: 'Heat a heavy skillet over high heat until smoking.' },
        { text: 'Sear steaks 2 minutes per side until well browned.' },
        { text: 'Reduce heat, add butter, garlic, and thyme; baste steaks for 1 minute.' },
        { text: 'Rest steaks 5 minutes before slicing against the grain.', phase: 'serve' },
      ],
      pricePerPortion: 15,
      analysis: { caloriesPerPortion: 880, caloriesTotal: 1760, keyIngredientTags: ['beef', 'butter', 'garlic'] },
      now,
    }),
    buildRecipe({
      id: 'r_demo_salad', title: '(Demo) Garden Salad', originalYield: 4,
      prepTime: '10m',
      ingredients: [
        { amount: 200, unit: 'g', name: 'Mixed salad leaves' },
        { amount: 150, unit: 'g', name: 'Cherry tomatoes' },
        { amount: 200, unit: 'g', name: 'Cucumber' },
        { amount: 30, unit: 'ml', name: 'Olive oil' },
        { amount: 15, unit: 'ml', name: 'Lemon juice' },
        { amount: 2, unit: 'g', name: 'Sea salt', locked: true },
        { amount: 1, unit: 'g', name: 'Black pepper', locked: true },
      ],
      steps: [
        { text: 'Wash salad leaves and pat dry.', phase: 'prep' },
        { text: 'Halve cherry tomatoes; slice cucumber into half-moons.', phase: 'prep' },
        { text: 'Whisk olive oil, lemon juice, salt, and pepper into a dressing.', phase: 'prep' },
        { text: 'Toss leaves, tomatoes, and cucumber with the dressing just before serving.', phase: 'serve' },
      ],
      pricePerPortion: 2.5,
      analysis: { caloriesPerPortion: 90, caloriesTotal: 360, keyIngredientTags: ['lettuce', 'tomato', 'cucumber'] },
      now,
    }),
    buildRecipe({
      id: 'r_demo_soup', title: '(Demo) Tomato Basil Soup', originalYield: 4,
      prepTime: '10m', cookTime: '30m',
      ingredients: [
        { amount: 800, unit: 'g', name: 'Canned tomatoes' },
        { amount: 150, unit: 'g', name: 'Yellow onion' },
        { amount: 15, unit: 'g', name: 'Garlic clove' },
        { amount: 500, unit: 'ml', name: 'Vegetable broth' },
        { amount: 10, unit: 'g', name: 'Fresh basil' },
        { amount: 100, unit: 'ml', name: 'Heavy cream' },
        { amount: 15, unit: 'ml', name: 'Olive oil' },
        { amount: 3, unit: 'g', name: 'Salt', locked: true },
        { amount: 1, unit: 'g', name: 'Black pepper', locked: true },
      ],
      steps: [
        { text: 'Dice onion and mince garlic.', phase: 'prep' },
        { text: 'Heat olive oil in a pot; sauté onion until soft, about 5 minutes.' },
        { text: 'Add garlic and cook for another minute.' },
        { text: 'Pour in canned tomatoes and broth; simmer 20 minutes.' },
        { text: 'Blend until smooth, then stir in cream and torn basil leaves.', phase: 'serve' },
      ],
      pricePerPortion: 2,
      analysis: { caloriesPerPortion: 200, caloriesTotal: 800, keyIngredientTags: ['tomato', 'basil', 'cream'] },
      now,
    }),
    buildRecipe({
      id: 'r_demo_pepper_sauce', title: '(Demo) Black Pepper Sauce', originalYield: 4,
      prepTime: '5m', cookTime: '15m',
      ingredients: [
        { amount: 1, unit: 'tbsp', name: 'Butter' },
        { amount: 30, unit: 'g', name: 'Shallot' },
        { amount: 15, unit: 'g', name: 'Cracked black peppercorns' },
        { amount: 15, unit: 'ml', name: 'Brandy' },
        { amount: 200, unit: 'ml', name: 'Beef stock' },
        { amount: 200, unit: 'ml', name: 'Double cream' },
        { amount: 1, unit: 'g', name: 'Sea salt', locked: true },
      ],
      steps: [
        { text: 'Finely dice the shallot. Crack the peppercorns coarsely with a pestle and mortar.', phase: 'prep' },
        { text: 'Melt butter in a small saucepan; sweat shallot 2–3 minutes until soft, not browned.' },
        { text: 'Add the cracked peppercorns; toast briefly to release their oils, ~30 seconds.' },
        { text: 'Pour in brandy and let it bubble off, then add beef stock; reduce by half.' },
        { text: 'Stir in the double cream; simmer until the sauce coats the back of a spoon. Season with salt.', phase: 'serve' },
      ],
      pricePerPortion: 2,
      analysis: { caloriesPerPortion: 220, caloriesTotal: 880, keyIngredientTags: ['black pepper', 'cream', 'shallot'] },
      now,
    }),
    buildRecipe({
      id: 'r_demo_cucumber_soup', title: '(Demo) Chilled Cucumber Soup', originalYield: 4,
      prepTime: '15m',
      ingredients: [
        { amount: 800, unit: 'g', name: 'Cucumber' },
        { amount: 200, unit: 'g', name: 'Greek yogurt' },
        { amount: 10, unit: 'g', name: 'Fresh dill' },
        { amount: 5, unit: 'g', name: 'Garlic clove' },
        { amount: 30, unit: 'ml', name: 'Olive oil' },
        { amount: 15, unit: 'ml', name: 'Lemon juice' },
        { amount: 3, unit: 'g', name: 'Sea salt', locked: true },
      ],
      steps: [
        { text: 'Peel cucumbers, halve lengthways, and scrape out the seeds.', phase: 'prep' },
        { text: 'Blend cucumbers with yogurt, dill, garlic, olive oil, and lemon juice until smooth.', phase: 'prep' },
        { text: 'Season with salt; taste and adjust acidity.', phase: 'prep' },
        { text: 'Chill at least 1 hour. Serve in cold bowls with a dill sprig.', phase: 'serve' },
      ],
      pricePerPortion: 3,
      analysis: { caloriesPerPortion: 140, caloriesTotal: 560, keyIngredientTags: ['cucumber', 'yogurt', 'dill'] },
      description: '🥒 A cool, herby cucumber soup with creamy Greek yogurt and a kiss of lemon — the starter that earns its keep on the hottest evenings.',
      now,
    }),
    buildRecipe({
      id: 'r_demo_scallops', title: '(Demo) Pan-Seared Scallops with Lemon Butter', originalYield: 4,
      prepTime: '5m', cookTime: '5m',
      ingredients: [
        { amount: 400, unit: 'g', name: 'King scallops' },
        { amount: 60, unit: 'g', name: 'Butter' },
        { amount: 10, unit: 'g', name: 'Garlic clove' },
        { amount: 1, unit: 'whole', name: 'Lemon' },
        { amount: 10, unit: 'g', name: 'Flat-leaf parsley' },
        { amount: 15, unit: 'ml', name: 'Olive oil' },
        { amount: 2, unit: 'g', name: 'Sea salt', locked: true },
      ],
      steps: [
        { text: 'Pat scallops bone-dry; season both sides with salt.', phase: 'prep' },
        { text: 'Heat a heavy skillet over high heat with olive oil until smoking.' },
        { text: 'Sear scallops 90 seconds per side until a deep golden crust forms; transfer to a warm plate.' },
        { text: 'Lower the heat; melt butter with crushed garlic and a squeeze of lemon.' },
        { text: 'Spoon the lemon-garlic butter over the scallops; finish with chopped parsley.', phase: 'serve' },
      ],
      pricePerPortion: 8,
      analysis: { caloriesPerPortion: 280, caloriesTotal: 1120, keyIngredientTags: ['scallops', 'butter', 'lemon'] },
      description: '🌟 Sweet sea scallops with a golden crust, finished in lemon-garlic butter that begs for crusty bread to mop the plate.',
      now,
    }),
    buildRecipe({
      id: 'r_demo_dumplings', title: '(Demo) Steamed Vegetable Dumplings', originalYield: 4,
      prepTime: '25m', cookTime: '8m',
      ingredients: [
        { amount: 24, unit: 'whole', name: 'Dumpling wrappers' },
        { amount: 200, unit: 'g', name: 'Napa cabbage' },
        { amount: 100, unit: 'g', name: 'Shiitake mushroom' },
        { amount: 100, unit: 'g', name: 'Carrot' },
        { amount: 15, unit: 'g', name: 'Fresh ginger' },
        { amount: 30, unit: 'ml', name: 'Soy sauce' },
        { amount: 10, unit: 'ml', name: 'Toasted sesame oil' },
        { amount: 30, unit: 'g', name: 'Spring onion' },
      ],
      steps: [
        { text: 'Finely chop cabbage, mushroom, carrot, ginger, and spring onion.', phase: 'prep' },
        { text: 'Salt the cabbage 10 minutes, squeeze out the liquid, then mix with the rest of the veg.', phase: 'prep' },
        { text: 'Stir in soy sauce and sesame oil.', phase: 'prep' },
        { text: 'Place 1 tsp filling on each wrapper; wet the edges and pleat shut.', phase: 'prep' },
        { text: 'Steam over high heat 8 minutes until the wrappers are translucent.' },
        { text: 'Serve with a dipping sauce of soy, rice vinegar, and chilli oil.', phase: 'serve' },
      ],
      pricePerPortion: 2.5,
      analysis: { caloriesPerPortion: 220, caloriesTotal: 880, keyIngredientTags: ['cabbage', 'mushroom', 'ginger'] },
      description: '🥟 Pillowy steamed parcels of cabbage, mushroom, and ginger — light, savoury, and impossible to stop eating.',
      now,
    }),
    buildRecipe({
      id: 'r_demo_tuna_tartare', title: '(Demo) Spicy Tuna Tartare', originalYield: 4,
      prepTime: '15m',
      ingredients: [
        { amount: 300, unit: 'g', name: 'Sushi-grade tuna' },
        { amount: 1, unit: 'whole', name: 'Ripe avocado' },
        { amount: 10, unit: 'ml', name: 'Toasted sesame oil' },
        { amount: 15, unit: 'ml', name: 'Soy sauce' },
        { amount: 10, unit: 'ml', name: 'Sriracha' },
        { amount: 1, unit: 'whole', name: 'Lime' },
        { amount: 20, unit: 'g', name: 'Spring onion' },
        { amount: 5, unit: 'g', name: 'Toasted sesame seeds' },
      ],
      steps: [
        { text: 'Dice the tuna into 5mm cubes with a very sharp knife; keep cold.', phase: 'prep' },
        { text: 'Whisk soy sauce, sesame oil, sriracha, and lime juice into a dressing.', phase: 'prep' },
        { text: 'Gently fold the tuna with diced avocado, dressing, and sliced spring onion.', phase: 'prep' },
        { text: 'Plate immediately; finish with toasted sesame seeds.', phase: 'serve' },
      ],
      pricePerPortion: 7,
      analysis: { caloriesPerPortion: 210, caloriesTotal: 840, keyIngredientTags: ['tuna', 'avocado', 'sriracha'] },
      description: '🐟 Diamond-cut sushi-grade tuna with creamy avocado and a sriracha-lime kick — sharp, bright, restaurant-quality from your own kitchen.',
      now,
    }),
    buildRecipe({
      id: 'r_demo_calamari', title: '(Demo) Crispy Fried Calamari', originalYield: 4,
      prepTime: '10m', cookTime: '5m',
      ingredients: [
        { amount: 500, unit: 'g', name: 'Squid rings, cleaned' },
        { amount: 100, unit: 'g', name: 'Plain flour' },
        { amount: 50, unit: 'g', name: 'Cornflour' },
        { amount: 5, unit: 'g', name: 'Sweet paprika' },
        { amount: 5, unit: 'g', name: 'Sea salt', locked: true },
        { amount: 1000, unit: 'ml', name: 'Vegetable oil' },
        { amount: 1, unit: 'whole', name: 'Lemon' },
        { amount: 10, unit: 'g', name: 'Flat-leaf parsley' },
      ],
      steps: [
        { text: 'Pat squid rings completely dry on kitchen paper.', phase: 'prep' },
        { text: 'Whisk flour, cornflour, paprika, and salt in a bowl.', phase: 'prep' },
        { text: 'Heat oil to 180°C in a deep pan.' },
        { text: 'Toss squid in the flour mix; shake off excess.', phase: 'prep' },
        { text: 'Fry in small batches 90 seconds until golden; drain on paper.' },
        { text: 'Plate with lemon wedges and chopped parsley.', phase: 'serve' },
      ],
      pricePerPortion: 5,
      analysis: { caloriesPerPortion: 320, caloriesTotal: 1280, keyIngredientTags: ['calamari', 'lemon', 'paprika'] },
      description: '🦑 Tender squid rings in a crisp, paprika-spiced crust — served piping hot with a bright squeeze of 🍋.',
      now,
    }),
    buildRecipe({
      id: 'r_demo_lamb_rack', title: '(Demo) Herb-Roasted Lamb Rack', originalYield: 4,
      prepTime: '15m', cookTime: '25m',
      ingredients: [
        { amount: 1, unit: 'kg', name: 'Lamb rack (8 ribs)' },
        { amount: 10, unit: 'g', name: 'Fresh rosemary' },
        { amount: 10, unit: 'g', name: 'Fresh thyme' },
        { amount: 15, unit: 'g', name: 'Garlic clove' },
        { amount: 30, unit: 'g', name: 'Dijon mustard' },
        { amount: 100, unit: 'g', name: 'Panko breadcrumbs' },
        { amount: 30, unit: 'ml', name: 'Olive oil' },
        { amount: 5, unit: 'g', name: 'Sea salt', locked: true },
        { amount: 2, unit: 'g', name: 'Black pepper', locked: true },
      ],
      steps: [
        { text: 'Trim and French-trim the rack if needed; season with salt and pepper.', phase: 'prep' },
        { text: 'Sear the fat side in a hot pan 3 minutes until well browned.' },
        { text: 'Chop rosemary, thyme, and garlic; mix with breadcrumbs and olive oil.', phase: 'prep' },
        { text: 'Brush rack with Dijon and press the herb crust on top.', phase: 'prep' },
        { text: 'Roast at 200°C for 18 minutes for medium-rare (54°C internal).' },
        { text: 'Rest 10 minutes loosely tented; carve into double chops.', phase: 'serve' },
      ],
      pricePerPortion: 12,
      analysis: { caloriesPerPortion: 520, caloriesTotal: 2080, keyIngredientTags: ['lamb', 'rosemary', 'mustard'] },
      description: '🐑 A herb-crusted rack of lamb with a Dijon-mustard kick — pink-centred, fragrant rosemary, the cleanest centrepiece for a dinner party.',
      now,
    }),
    buildRecipe({
      id: 'r_demo_swordfish', title: '(Demo) Grilled Swordfish Steak with Salsa Verde', originalYield: 4,
      prepTime: '15m', cookTime: '8m',
      ingredients: [
        { amount: 720, unit: 'g', name: 'Swordfish steaks (4 × 180g)' },
        { amount: 45, unit: 'ml', name: 'Olive oil' },
        { amount: 1, unit: 'whole', name: 'Lemon' },
        { amount: 30, unit: 'g', name: 'Flat-leaf parsley' },
        { amount: 20, unit: 'g', name: 'Capers in brine' },
        { amount: 20, unit: 'g', name: 'Anchovy fillets' },
        { amount: 5, unit: 'g', name: 'Garlic clove' },
        { amount: 15, unit: 'ml', name: 'White wine vinegar' },
      ],
      steps: [
        { text: 'Chop parsley, capers, anchovy, and garlic finely; combine with 30ml olive oil and the vinegar — that is the salsa verde.', phase: 'prep' },
        { text: 'Pat swordfish dry; brush with the remaining oil and season with salt.', phase: 'prep' },
        { text: 'Heat a griddle pan or BBQ grill until very hot.' },
        { text: 'Grill steaks 4 minutes per side until just-cooked and firm.' },
        { text: 'Plate the steaks, spoon salsa verde over the top, and squeeze lemon on top.', phase: 'serve' },
      ],
      pricePerPortion: 11,
      analysis: { caloriesPerPortion: 380, caloriesTotal: 1520, keyIngredientTags: ['swordfish', 'capers', 'parsley'] },
      description: '🐟 Meaty swordfish from the grill, crowned with a punchy salsa verde of capers, parsley, and lemon — Mediterranean simplicity at its peak.',
      now,
    }),
    buildRecipe({
      id: 'r_demo_pork_belly', title: '(Demo) Slow-Cooked Pork Belly', originalYield: 6,
      prepTime: '20m', cookTime: '2h 30m',
      ingredients: [
        { amount: 1000, unit: 'g', name: 'Pork belly' },
        { amount: 60, unit: 'ml', name: 'Light soy sauce' },
        { amount: 30, unit: 'g', name: 'Soft brown sugar' },
        { amount: 2, unit: 'whole', name: 'Star anise' },
        { amount: 30, unit: 'g', name: 'Fresh ginger' },
        { amount: 20, unit: 'g', name: 'Garlic clove' },
        { amount: 50, unit: 'g', name: 'Spring onion' },
        { amount: 50, unit: 'ml', name: 'Shaoxing wine' },
        { amount: 400, unit: 'ml', name: 'Chicken stock' },
      ],
      steps: [
        { text: 'Score the pork skin in a 1cm cross-hatch; blanch in boiling water 2 minutes; drain.', phase: 'prep' },
        { text: 'Sear the pork skin-down in a heavy pot for 5 minutes until coloured.' },
        { text: 'Add soy, sugar, star anise, sliced ginger and garlic, spring onion whites, wine, and stock.' },
        { text: 'Bring to a gentle simmer; cover and cook 2 hours 30 minutes until fork-tender.' },
        { text: 'Lift the pork onto a board; reduce the braising liquid to a glossy sauce.' },
        { text: 'Slice the pork into thick fingers, plate, and spoon the sauce over.', phase: 'serve' },
      ],
      pricePerPortion: 9,
      analysis: { caloriesPerPortion: 580, caloriesTotal: 3480, keyIngredientTags: ['pork belly', 'soy', 'star anise'] },
      description: '🥢 Melt-in-your-mouth pork belly braised low and slow in soy, star anise, and ginger — glossy sauce that begs for rice.',
      now,
    }),
    buildRecipe({
      id: 'r_demo_tikka_masala', title: '(Demo) Chicken Tikka Masala', originalYield: 4,
      prepTime: '15m', cookTime: '30m',
      ingredients: [
        { amount: 800, unit: 'g', name: 'Chicken thigh, boneless' },
        { amount: 200, unit: 'g', name: 'Natural yogurt' },
        { amount: 60, unit: 'g', name: 'Tikka masala paste' },
        { amount: 5, unit: 'g', name: 'Garam masala' },
        { amount: 1, unit: 'whole', name: 'Yellow onion' },
        { amount: 20, unit: 'g', name: 'Garlic clove' },
        { amount: 30, unit: 'g', name: 'Fresh ginger' },
        { amount: 400, unit: 'g', name: 'Tomato passata' },
        { amount: 200, unit: 'ml', name: 'Double cream' },
        { amount: 30, unit: 'g', name: 'Butter' },
        { amount: 10, unit: 'g', name: 'Fresh coriander' },
      ],
      steps: [
        { text: 'Cube the chicken; marinate in yogurt and half the tikka paste for 30 minutes (or overnight).', phase: 'prep' },
        { text: 'Sear the marinated chicken in a hot pan until charred at the edges; set aside.' },
        { text: 'In the same pan, melt the butter; sauté the diced onion until golden, then add minced garlic and ginger.' },
        { text: 'Stir in the remaining tikka paste and garam masala; bloom 30 seconds.' },
        { text: 'Pour in the passata; simmer 10 minutes until the sauce darkens.' },
        { text: 'Stir in the cream and chicken; simmer 5 minutes until the chicken is cooked through.' },
        { text: 'Scatter chopped coriander; serve with basmati rice.', phase: 'serve' },
      ],
      pricePerPortion: 6,
      analysis: { caloriesPerPortion: 620, caloriesTotal: 2480, keyIngredientTags: ['chicken', 'tikka', 'masala'] },
      description: '🍛 Tender yogurt-marinated chicken in a velvety tomato-cream masala — warming spice with a creamy finish, the takeaway classic done at home.',
      now,
    }),
    buildRecipe({
      id: 'r_demo_creme_brulee', title: '(Demo) Crème Brûlée', originalYield: 6,
      prepTime: '15m', cookTime: '35m',
      ingredients: [
        { amount: 500, unit: 'ml', name: 'Double cream' },
        { amount: 1, unit: 'whole', name: 'Vanilla pod' },
        { amount: 5, unit: 'whole', name: 'Large egg yolks' },
        { amount: 80, unit: 'g', name: 'Caster sugar' },
        { amount: 40, unit: 'g', name: 'Caster sugar (for the brûlée crust)' },
      ],
      steps: [
        { text: 'Split the vanilla pod; scrape the seeds into the cream and add the pod.', phase: 'prep' },
        { text: 'Heat the cream just to a simmer; remove from heat and let infuse 10 minutes.' },
        { text: 'Whisk the yolks with 80g sugar until pale; temper the warm cream in slowly.', phase: 'prep' },
        { text: 'Strain into ramekins; bake in a water bath at 150°C for 35 minutes until just set with a slight wobble.' },
        { text: 'Chill at least 4 hours.' },
        { text: 'Sprinkle a thin even layer of sugar on each; torch until amber and glassy. Serve within 5 minutes.', phase: 'serve' },
      ],
      pricePerPortion: 3,
      analysis: { caloriesPerPortion: 410, caloriesTotal: 2460, keyIngredientTags: ['cream', 'vanilla', 'custard'] },
      description: '🍮 Silken vanilla custard hidden under a glass-thin layer of torched sugar — the satisfying crack of a perfect brûlée at the table.',
      now,
    }),
  ];
}

export function buildDemoEvents(now: number): DemoEvent[] {
  // 2026-05-14 18:00 in UTC. Local construction would be timezone-sensitive
  // in the SPA's existing seed; the worker has no user TZ context, so we
  // anchor to UTC. SPA renders in the user's locale at read time.
  //
  // Bigger event (v2): 5 dishes spread across a 90-minute prep window
  // ending at the 18:00 BST serve. Starters fired earliest, mains last.
  const serve = new Date(Date.UTC(2026, 4, 14, 17, 0, 0));        // 18:00 BST
  const saladStart = new Date(Date.UTC(2026, 4, 14, 15, 30, 0));   // 16:30 BST
  const calamariStart = new Date(Date.UTC(2026, 4, 14, 15, 45, 0)); // 16:45 BST
  const tikkaStart = new Date(Date.UTC(2026, 4, 14, 16, 0, 0));    // 17:00 BST
  const lambStart = new Date(Date.UTC(2026, 4, 14, 16, 15, 0));    // 17:15 BST
  const ribeyeStart = new Date(Date.UTC(2026, 4, 14, 16, 30, 0));  // 17:30 BST

  const salad = {
    id: 'd_demo_salad',
    name: '(Demo) Garden Salad',
    recipeId: 'r_demo_salad',
    portions: 40,
    startAt: saladStart.toISOString(),
  };
  const calamari = {
    id: 'd_demo_calamari',
    name: '(Demo) Crispy Fried Calamari',
    recipeId: 'r_demo_calamari',
    portions: 10,
    startAt: calamariStart.toISOString(),
  };
  const tikka = {
    id: 'd_demo_tikka_masala',
    name: '(Demo) Chicken Tikka Masala',
    recipeId: 'r_demo_tikka_masala',
    portions: 10,
    startAt: tikkaStart.toISOString(),
  };
  const lamb = {
    id: 'd_demo_lamb_rack',
    name: '(Demo) Herb-Roasted Lamb Rack',
    recipeId: 'r_demo_lamb_rack',
    portions: 10,
    startAt: lambStart.toISOString(),
  };
  const ribeye = {
    id: 'd_demo_ribeye',
    name: '(Demo) Ribeye',
    recipeId: 'r_demo_ribeye',
    portions: 20,
    startAt: ribeyeStart.toISOString(),
  };
  return [
    {
      id: 'e_demo_main',
      title: 'Demo Event',
      serveAt: serve.toISOString(),
      location: 'Home kitchen',
      // £600 budget reflects the bigger dish lineup (5 dishes, 90 portions
      // across mixed proteins). Casual but generous.
      budget: 600,
      numberOfGuests: 8,
      contactName: 'Alex Johnson',
      contactEmail: 'alex@example.com',
      contactPhone: '+44 7700 900123',
      notes: [
        '8 guests for a birthday dinner.',
        'Anna and Ben are vegetarian (no meat or fish).',
        'Carla has a confirmed peanut allergy — strict.',
        'Dave (birthday) loves a classic steak with peppercorn sauce.',
        'Budget is generous (~£600 total food cost) — go for a five-dish lineup.',
        'Casual ambience, no formal courses needed.',
      ].join('\n'),
      dishes: [salad, calamari, tikka, lamb, ribeye],
      sections: [
        { id: 's_demo_starters', name: 'Starters', dishIds: [salad.id, calamari.id] },
        { id: 's_demo_mains', name: 'Mains', dishIds: [tikka.id, lamb.id, ribeye.id] },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}
