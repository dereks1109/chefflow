import { test, expect } from '@playwright/test';

// Verification spec for the four allergen + contact features.
//
// The test originally relied on the (Demo) Black Pepper Sauce recipe being
// auto-seeded by the worker on first sign-in. In E2E mode there's no real
// Clerk user, so SyncRunner short-circuits and demos never seed — the
// /recipes library would render "No recipes yet". We now seed an inline
// recipe with milk-flagged ingredients via IndexedDB before the test runs,
// mirroring the seeding pattern used by event-view-inline-edit.spec.ts.
// Rows without `userId` are visible to every reader (legacy / test-fixture
// path in listRecipes), so the seed needs no auth setup.

const SEED_RECIPE_ID = 'r_allergen_seed';

async function seedRecipeWithMilkAllergen(page: import('@playwright/test').Page) {
  await page.evaluate(async (recipeId) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('chefflow');
      req.onsuccess = () => {
        const db = req.result;
        if (!Array.from(db.objectStoreNames).includes('recipes')) {
          db.close();
          return resolve();
        }
        const tx = db.transaction('recipes', 'readwrite');
        const now = Date.now();
        tx.objectStore('recipes').put({
          id: recipeId,
          title: '(Demo) Black Pepper Sauce',
          description: 'Classic peppercorn pan sauce, finished with butter and cream.',
          originalYield: 4,
          ingredients: [
            { id: 'i1', raw: '{50|g|butter}',   amount: 50,  unit: 'g',  name: 'butter', isLocked: false, allergenFlags: ['milk'] },
            { id: 'i2', raw: '{200|ml|cream}',  amount: 200, unit: 'ml', name: 'cream',  isLocked: false, allergenFlags: ['milk'] },
            { id: 'i3', raw: '{2|tbsp|peppercorns}', amount: 2, unit: 'tbsp', name: 'black peppercorns', isLocked: false },
          ],
          steps: [
            { id: 's1', text: 'Crush peppercorns and toast in a dry pan.' },
            { id: 's2', text: 'Add butter and let it foam.' },
            { id: 's3', text: 'Pour in cream and reduce by half.' },
          ],
          allergens: ['milk'],
          // RecipeCard's RecipeAnalysisRow (the row that paints the
          // allergen pills) only renders when `recipe.analysis` is
          // truthy. An empty object is enough; tests don't need the
          // calorie/source fields.
          analysis: {},
          createdAt: now,
          updatedAt: now,
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    });
  }, SEED_RECIPE_ID);
}

test('allergen popover, removal modal with 5s cooldown, history, contact page', async ({ page }) => {
  // Boot the SPA first so IndexedDB ('chefflow') is opened + upgraded to its
  // current Dexie schema. THEN seed: writing into a store that doesn't yet
  // exist would silently drop the row.
  await page.goto('/recipes');
  await expect(page).toHaveURL(/\/recipes/);
  await seedRecipeWithMilkAllergen(page);
  // liveQuery in the library picks up the new row on the next tick.
  await page.reload();

  // --- Feature 4: Contact link in top nav + /contact page loads ---
  const contactLink = page.getByRole('link', { name: /^contact$/i }).first();
  await expect(contactLink).toBeVisible();
  await contactLink.click();
  await expect(page).toHaveURL(/\/contact/);
  await expect(page.getByRole('heading', { name: /get in touch/i })).toBeVisible();
  await expect(page.getByTestId('contact-email-input')).toBeVisible();
  await expect(page.getByTestId('contact-send')).toBeVisible();
  await page.screenshot({ path: 'test-results/contact-page.png', fullPage: true });

  // Back to recipes
  await page.goto('/recipes');

  // --- Feature 1: hover an allergen pill on the library card → popover lists ingredients ---
  // Find any allergen pill — the demo recipes seeded by seed.ts include allergens.
  // The pill is a span with text matching "Milk" or "Eggs" inside the .group.relative wrapper.
  const allergenPill = page.locator('span[role="button"][aria-label^="Allergen:"]').first();
  await expect(allergenPill).toBeVisible({ timeout: 5000 });
  // Tooltip is a span with role="tooltip" — opacity-0 → opacity-100 on group-hover.
  // Copy is "Flagged on" + ingredient list (AllergenBadge.tsx, post-2026
  // tooltip rewrite — older specs asserted "caused by:" which no longer renders).
  await allergenPill.hover();
  const tooltip = page.locator('span[role="tooltip"]', { hasText: /flagged on/i }).first();
  await expect(tooltip).toBeVisible();
  await page.screenshot({ path: 'test-results/allergen-popover.png' });

  // --- Open the recipe editor so we can exercise the removal modal ---
  // Card primary link is /recipes/:id (read view); the edit page lives at
  // /recipes/:id/edit and is reached via a kebab menu on the card. Skip
  // the indirection — go straight to the editor for the seeded recipe.
  await page.goto(`/recipes/${SEED_RECIPE_ID}/edit`);
  await expect(page).toHaveURL(/\/recipes\/.+\/edit/);

  // --- Feature 2: click X on an allergen pill in editor → modal opens, cooldown ticks ---
  // EditablePill's X button has aria-label "Remove allergen <label>".
  const removeBtn = page.locator('button[aria-label^="Remove allergen"]').first();
  await removeBtn.click();

  // Modal visible — step 1 is the reason picker; Continue is gated until
  // at least one reason is checked. (Old flow was a single step with the
  // Confirm cooldown firing immediately; current flow splits Reason and
  // Confirm into two steps so chefs can't accidentally confirm a removal
  // without first acknowledging the reason copy.)
  const modal = page.getByTestId('allergen-removal-modal');
  await expect(modal).toBeVisible();
  const continueBtn = page.getByTestId('allergen-removal-continue');
  await expect(continueBtn).toBeDisabled();

  // Tick a reason → Continue enables.
  await page.getByTestId('allergen-reason-mistakenly-added').check();
  await expect(continueBtn).toBeEnabled();
  await continueBtn.click();

  // Step 2: 5-second cooldown then Confirm fires.
  const confirmBtn = page.getByTestId('allergen-removal-confirm');
  await expect(confirmBtn).toBeDisabled();
  await expect(confirmBtn).toHaveText(/Confirm removal \(\d\)/);
  await page.waitForTimeout(5500);
  await expect(confirmBtn).toBeEnabled();
  await expect(confirmBtn).toHaveText(/Confirm removal$/);

  // --- Feature 3: confirm → modal closes, allergen pill is gone ---
  // The audit-history section under the editor only renders when the
  // current Clerk user matches the audit's userClerkId. In E2E mode
  // there's no real Clerk user, so the filter excludes anon-id audit
  // entries and the section stays hidden — we can't exercise the
  // history surface here. The user-visible outcome we CAN verify is
  // that the milk allergen pill has been removed from the recipe.
  await confirmBtn.click();
  await expect(modal).toBeHidden();

  // The recipe-level allergen pill (with X button) should be gone — the
  // Allergens section shows the "No allergens flagged yet" placeholder.
  await expect(page.locator('button[aria-label^="Remove allergen"]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/post-removal.png', fullPage: true });
});
