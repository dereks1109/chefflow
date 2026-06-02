/**
 * UX audit screenshot capture — 2026-06-02
 *
 * Visits each primary surface at desktop + mobile viewports and saves
 * a full-page screenshot to ../docs/ux-audit-2026-06-02/. Used to
 * ground the UX audit in real visual state rather than abstract
 * assessment.
 *
 * Seeds two demo rows (one recipe, one event) directly into Dexie via
 * page.evaluate so the editor + view surfaces have real content
 * instead of empty-state placeholders.
 *
 * Not a regression test — assertions are minimal (page renders without
 * throwing). The deliverable is the screenshots in docs/.
 */

import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, '..', '..', 'docs', 'ux-audit-2026-06-02');
mkdirSync(OUT_DIR, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

// Seed a recipe + event so editor / view surfaces aren't empty.
const SEED_RECIPE_ID = 'r_ux_audit_creme';
const SEED_EVENT_ID = 'e_ux_audit_dinner';

// The app stamps every Dexie row with userId (Clerk subject when signed in,
// else an `anon:*` id from localStorage). To make seeded rows visible to the
// app's read filters we must use the SAME id. Easiest: pre-seed localStorage
// with a known anon id BEFORE the app boots so getCurrentUserId() reads it.
const FAKE_USER_ID = 'anon:e2e_audit_2026';

async function seedDexie(page: Page) {
  await page.evaluate(
    async ({ recipeId, eventId, userId }) => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 20; i++) {
        try {
          if (window.indexedDB) break;
        } catch {/* keep waiting */}
        await wait(100);
      }
      const recipe = {
        id: recipeId,
        userId,
        title: '(Demo) Crème Brûlée',
        description:
          '🍮 Silken vanilla custard hidden under a glass-thin layer of torched sugar — the satisfying crack of a perfect brûlée.',
        originalYield: 6,
        pricePerPortion: 3,
        prepTime: { hours: 0, minutes: 15 },
        cookTime: { hours: 0, minutes: 35 },
        ingredients: [
          { id: 'i1', raw: '{500|ml|Double cream}', amount: 500, unit: 'ml', name: 'Double cream', isLocked: false, allergenFlags: ['milk'] },
          { id: 'i2', raw: '{1|ea|Vanilla pod}',   amount: 1,   unit: 'ea', name: 'Vanilla pod',   isLocked: false },
          { id: 'i3', raw: '{6|ea|Large egg yolks}', amount: 6, unit: 'ea', name: 'Large egg yolks', isLocked: false, allergenFlags: ['eggs'] },
          { id: 'i4', raw: '{80|g|Caster sugar}', amount: 80, unit: 'g', name: 'Caster sugar', isLocked: false },
          { id: 'i5', raw: '{40|g|Caster sugar (brulee)}', amount: 40, unit: 'g', name: 'Caster sugar (for the brûlée crust)', isLocked: false },
        ],
        steps: [
          { id: 's1', text: 'Split the vanilla pod; scrape the seeds into the cream and add the pod.' },
          { id: 's2', text: 'Heat the cream just to a simmer; remove from heat and let infuse 10 minutes.' },
          { id: 's3', text: 'Whisk the yolks with 80g sugar until pale; temper the warm cream in slowly.' },
          { id: 's4', text: 'Strain into ramekins; bake in a water bath at 150°C for 35 minutes.' },
          { id: 's5', text: 'Chill at least 4 hours.' },
          { id: 's6', text: 'Sprinkle a thin even layer of sugar; torch until amber and glassy.' },
        ],
        allergens: ['milk', 'eggs'],
        otherTags: ['italian', 'dessert', 'classic'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const event = {
        id: eventId,
        userId,
        title: 'Demo Event',
        serveAt: '2026-05-14T18:00:00.000Z',
        notes: '8 guests for a birthday dinner. Anna and Ben are vegetarian (no meat or fish). Carla has a nut allergy.',
        dishes: [
          { id: 'd1', recipeId, name: 'Crème Brûlée', portions: 8, startAt: '2026-05-14T17:00:00.000Z' },
          { id: 'd2', name: 'Starter salad', portions: 8, startAt: '2026-05-14T17:30:00.000Z' },
          { id: 'd3', name: 'Main course', portions: 8, startAt: '2026-05-14T17:45:00.000Z' },
          { id: 'd4', name: 'Bread basket', portions: 8, startAt: '2026-05-14T17:55:00.000Z' },
          { id: 'd5', name: 'Cheese plate', portions: 8, startAt: '2026-05-14T18:30:00.000Z' },
        ],
        workflow: Array.from({ length: 33 }, (_, i) => ({ id: `w${i}`, label: `Step ${i + 1}`, minutes: 5 })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const blankEvent = {
        id: 'e_ux_audit_blank',
        userId,
        title: '',
        dishes: [],
        notes: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      // Open the Dexie database (name + version known from src/db/dexie.ts).
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('chefflow');
        req.onsuccess = () => {
          const db = req.result;
          const storeNames = Array.from(db.objectStoreNames) as string[];
          if (!storeNames.includes('recipes') || !storeNames.includes('events')) {
            db.close();
            return resolve(); // app not booted yet; caller will retry
          }
          const tx = db.transaction(['recipes', 'events'], 'readwrite');
          tx.objectStore('recipes').put(recipe);
          tx.objectStore('events').put(event);
          tx.objectStore('events').put(blankEvent);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = () => { req.result.close(); resolve(); };
      });
    },
    { recipeId: SEED_RECIPE_ID, eventId: SEED_EVENT_ID, userId: FAKE_USER_ID },
  );
}

async function presetAnonUserId(page: Page) {
  await page.addInitScript((uid) => {
    window.localStorage.setItem('chefflow:anon-session-id', uid);
  }, FAKE_USER_ID);
}

async function screenshot(page: Page, name: string) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  // Small additional settle for animations / lazy-loaded chunks.
  await page.waitForTimeout(400);
  await page.screenshot({
    path: join(OUT_DIR, `${name}.png`),
    fullPage: true,
  });
}

// UngatedApp (E2E mode) doesn't register /recipes/:id (view), /teams, or
// /teams/:id — those routes only exist in PublicApp + RequireAuth gating.
// Skip those for the audit; they're owner-side surfaces the user already
// sees in production. The editor page IS in UngatedApp so we hit it via
// the UI flow below (Create blank → /recipes/:newId/edit) instead of a
// hard-coded id, since the in-Dexie seed has the wrong schema shape.
const SURFACES: Array<{ name: string; path: string }> = [
  { name: '01-recipes-library',       path: '/recipes' },
  { name: '04-events-library',        path: '/events' },
  { name: '05-event-view',            path: `/events/${SEED_EVENT_ID}` },
  { name: '06-event-editor',          path: `/events/${SEED_EVENT_ID}/edit` },
  { name: '07-workflows-library',     path: '/workflows' },
  { name: '09-community',             path: '/community' },
  { name: '10-contact',               path: '/contact' },
  { name: '11-settings',              path: '/settings' },
];

async function captureRecipeEditor(page: Page, suffix: 'desktop' | 'mobile') {
  // Use the UI's "Create blank" flow so the editor lands on a valid recipe
  // shape the component is happy to render (manually-seeded rows are missing
  // required step fields like kind/phase/thermalClass).
  await page.goto('/recipes');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const newBtn = page.getByRole('button', { name: /new recipe|create your first recipe/i });
  await newBtn.first().click();
  const blankBtn = page.getByTestId('recipe-sheet-create-blank');
  await blankBtn.click();
  await page.waitForURL(/\/recipes\/[^/]+\/edit/, { timeout: 10_000 });
  await page.waitForTimeout(500);
  // T18 audit — add 3 ingredients so the screenshot proves the
  // Ingredients column respects the 30/70 ratio when populated.
  const addBtn = page.getByRole('button', { name: /add ingredient/i });
  for (let i = 0; i < 3; i++) await addBtn.click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(OUT_DIR, `03-recipe-editor-${suffix}.png`),
    fullPage: true,
  });
}

test.describe('UX audit screenshots — 2026-06-02', () => {
  test('seed Dexie + capture every surface at desktop + mobile', async ({ browser }) => {
    test.setTimeout(180_000);
    // Desktop pass
    {
      const ctx = await browser.newContext({ viewport: DESKTOP });
      const page = await ctx.newPage();
      await presetAnonUserId(page);
      // First nav to root so the app boots + opens Dexie before we seed.
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      await seedDexie(page);
      await page.waitForTimeout(500);
      for (const { name, path } of SURFACES) {
        await page.goto(path);
        await screenshot(page, `${name}-desktop`);
      }
      await captureRecipeEditor(page, 'desktop');
      await ctx.close();
    }
    // Mobile pass
    {
      const ctx = await browser.newContext({ viewport: MOBILE });
      const page = await ctx.newPage();
      await presetAnonUserId(page);
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      await seedDexie(page);
      await page.waitForTimeout(500);
      for (const { name, path } of SURFACES) {
        await page.goto(path);
        await screenshot(page, `${name}-mobile`);
      }
      await captureRecipeEditor(page, 'mobile');
      await ctx.close();
    }
  });
});
