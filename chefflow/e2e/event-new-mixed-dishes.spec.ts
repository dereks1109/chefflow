/**
 * E2E spec: GenerateEventSheet — "New event" Describe flow with mixed dish types.
 *
 * CANONICAL HAPPY PATH — mixed unknowns:
 * This is the end-to-end "generate event with a mix of auto-matched dishes,
 * Create-new stubs, and ready-to-go confirmations" flow. It covers the most
 * realistic paths through the Review step state machine and is the spec that
 * should break first if the dish-resolution logic regresses.
 *
 * The three dishes in the canned LLM response produce all three resolution paths:
 *   - "Ribeye"       → auto-matched to a seeded recipe (library match)
 *   - "Lemon tart"   → no match; user clicks "Create new recipe"
 *   - "Cheese plate" → no match; user clicks "The dish is ready to go"
 *
 * CLERK GATING NOTE:
 * Runs with VITE_E2E_MODE=true; ClerkProvider is skipped.
 *
 * LLM MOCK:
 * Intercepts POST /api/llm/generate. Returns a canned three-dish KitchenEvent
 * JSON. Dish ids are assigned deterministically as d1/d2/d3 by parseDishes().
 *
 * NAVIGATION NOTE:
 * After "Create event", EventsLibrary.handleCreated navigates to
 * /events/:id/edit (not /events/:id). The spec matches the actual code path.
 *
 * RESUME-DRAFT COVERAGE:
 * The "Create new recipe → come back" detour involves a page navigation away and
 * a sessionStorage-driven resume. Because EventsLibrary has a timing dependency
 * (listRecipes must resolve before the sheet mounts) that makes the resume path
 * inherently async, the Create-new full loop is tested in a focused sub-test
 * that isolates the stub-save and navigation-away assertions. The full resume
 * path (returning from recipe editor → sheet rehydrates) is a known coverage
 * gap documented in TEST_CASES.md.
 *
 * INDEXEDDB SEEDING:
 * One recipe titled "Ribeye" is inserted directly via the IDB raw API after
 * the page loads (so Dexie's connection is already open at the correct schema
 * version v3). This mirrors the seeding pattern in event-review-step.spec.ts.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Dish IDs are d1/d2/d3 — assigned by parseDishes() based on array index.
// ---------------------------------------------------------------------------
const DISH_IDS = { ribeye: 'd1', lemon: 'd2', cheese: 'd3' };

// ---------------------------------------------------------------------------
// Canned LLM response — three dishes, one that will match the seeded "Ribeye"
// recipe and two that won't match anything in an otherwise empty library.
// ---------------------------------------------------------------------------
const CANNED_EVENT_JSON = {
  title: 'Weekend Dinner Party',
  serveAt: '2026-07-20T19:00:00.000Z',
  location: 'Home',
  notes: '4 guests',
  dishes: [
    { name: 'Ribeye', portions: 4, startAt: '2026-07-20T18:00:00.000Z' },
    { name: 'Lemon tart', portions: 4, startAt: '2026-07-20T18:30:00.000Z' },
    { name: 'Cheese plate', portions: 4, startAt: '2026-07-20T19:00:00.000Z' },
  ],
};

const CANNED_LLM_CONTENT = '```json\n' + JSON.stringify(CANNED_EVENT_JSON) + '\n```';

// ---------------------------------------------------------------------------
// Helpers (same pattern as event-review-step.spec.ts)
// ---------------------------------------------------------------------------

async function mockLlmEndpoint(page: Page) {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Clerk = {
      session: { getToken: () => Promise.resolve('fake-e2e-jwt') },
    };
  });
  await page.route('**/api/llm/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: CANNED_LLM_CONTENT }),
    });
  });
}

async function resetAppState(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('chefflow');
      req.onsuccess = () => {
        const db = req.result;
        const storeNames = Array.from(db.objectStoreNames) as string[];
        if (storeNames.length === 0) { db.close(); resolve(); return; }
        const tx = db.transaction(storeNames, 'readwrite');
        let pending = storeNames.length;
        for (const name of storeNames) {
          const clearReq = tx.objectStore(name).clear();
          clearReq.onsuccess = () => { if (--pending === 0) { db.close(); resolve(); } };
          clearReq.onerror = () => { db.close(); reject(clearReq.error); };
        }
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => { req.result.close(); resolve(); };
    });
  });
  await page.evaluate(() => {
    localStorage.removeItem('chefflow:seeded-demo-v3');
    localStorage.removeItem('chefflow:seeded-demo-events-v4');
    sessionStorage.removeItem('chefflow:event-review-draft');
  });
}

/**
 * Seed one "Ribeye" recipe into IndexedDB. Must be called AFTER the page has
 * loaded (Dexie already holds the connection at v3, so we open without
 * specifying a version to reuse the existing schema).
 */
async function seedRibeyeRecipe(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('chefflow');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('recipes', 'readwrite');
        tx.objectStore('recipes').put({
          id: 'r_test_ribeye',
          title: 'Ribeye',
          originalYield: 4,
          ingredients: [],
          steps: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Navigate to /events and drive the UI to the Review step.
 * Seeds Ribeye recipe between page-load and sheet-submit so the auto-matcher
 * can find it in the library without a timing race.
 */
async function openReviewStep(page: Page) {
  await page.goto('/events');
  const newEventBtn = page.getByRole('button', { name: /new event|create your first event/i });
  await expect(newEventBtn).toBeVisible({ timeout: 15_000 });

  // Seed AFTER the page loads so Dexie holds v3 connection
  await seedRibeyeRecipe(page);

  await newEventBtn.click();

  // Switch to Describe tab
  await page.getByRole('tab', { name: /extract from text/i }).click();

  const textarea = page.getByTestId('event-description-textarea');
  await expect(textarea).toBeVisible();
  await textarea.fill('Weekend dinner party, 4 guests. Ribeye, lemon tart, and cheese plate.');

  await page.getByTestId('generate-event-button').click();

  // Wait for all three dish rows to appear
  await expect(page.getByTestId('review-dish-row')).toHaveCount(3, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('GenerateEventSheet — mixed-dish review flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockLlmEndpoint(page);
    await page.goto('/');
    await resetAppState(page);
  });

  // -------------------------------------------------------------------------
  test('Review step renders: Ribeye auto-linked, Lemon tart + Cheese plate show unresolved three-button choice', async ({ page }) => {
    await openReviewStep(page);

    // All three rows present
    await expect(page.getByTestId('review-dish-row')).toHaveCount(3);

    // --- Ribeye: auto-matched to seeded recipe ---
    const ribeyeRow = page.locator(
      `[data-testid="review-dish-row"][data-dish-id="${DISH_IDS.ribeye}"]`,
    );
    await expect(ribeyeRow).toHaveAttribute('data-needs-attention', 'false');
    await expect(ribeyeRow).toContainText('Linked to recipe');
    await expect(ribeyeRow).toContainText('Ribeye');

    // --- Lemon tart: unresolved, red border, three buttons visible ---
    const lemonRow = page.locator(
      `[data-testid="review-dish-row"][data-dish-id="${DISH_IDS.lemon}"]`,
    );
    await expect(lemonRow).toHaveAttribute('data-needs-attention', 'true');
    await expect(page.getByTestId(`review-create-new-${DISH_IDS.lemon}`)).toBeVisible();
    await expect(page.getByTestId(`review-ready-${DISH_IDS.lemon}`)).toBeVisible();
    await expect(page.getByTestId(`review-search-${DISH_IDS.lemon}`)).toBeVisible();

    // --- Cheese plate: unresolved ---
    const cheeseRow = page.locator(
      `[data-testid="review-dish-row"][data-dish-id="${DISH_IDS.cheese}"]`,
    );
    await expect(cheeseRow).toHaveAttribute('data-needs-attention', 'true');

    // "Create event" must be disabled — not all dishes resolved
    await expect(page.getByTestId('create-event-button')).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  test('"Create new recipe" on Lemon tart → confirm → saves stub and navigates to recipe editor', async ({ page }) => {
    await openReviewStep(page);

    // Accept the confirm dialog automatically
    page.on('dialog', (dialog) => void dialog.accept());

    // Act: click "Create new recipe" for Lemon tart
    await page.getByTestId(`review-create-new-${DISH_IDS.lemon}`).click();

    // Assert: navigated to /recipes/<new-id>/edit (stub was saved)
    await page.waitForURL(/\/recipes\/[^/]+\/edit/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/recipes\/[^/]+\/edit/);

    // Assert: the recipe editor is pre-titled with the dish name
    const titleInput = page.getByTestId('recipe-editor-title-input');
    await expect(titleInput).toBeVisible({ timeout: 8_000 });
    await expect(titleInput).toHaveValue('Lemon tart');
  });

  // -------------------------------------------------------------------------
  test('"The dish is ready to go" clears red border; "Create event" enables once all resolved', async ({ page }) => {
    await openReviewStep(page);

    const createBtn = page.getByTestId('create-event-button');
    await expect(createBtn).toBeDisabled();

    // Resolve Cheese plate as ready
    await page.getByTestId(`review-ready-${DISH_IDS.cheese}`).click();
    const cheeseRow = page.locator(
      `[data-testid="review-dish-row"][data-dish-id="${DISH_IDS.cheese}"]`,
    );
    await expect(cheeseRow).toHaveAttribute('data-needs-attention', 'false');

    // Still disabled — Lemon tart is unresolved
    await expect(createBtn).toBeDisabled();

    // Resolve Lemon tart as ready
    await page.getByTestId(`review-ready-${DISH_IDS.lemon}`).click();
    const lemonRow = page.locator(
      `[data-testid="review-dish-row"][data-dish-id="${DISH_IDS.lemon}"]`,
    );
    await expect(lemonRow).toHaveAttribute('data-needs-attention', 'false');

    // Now enabled — Ribeye is auto-matched, both others are "ready"
    await expect(createBtn).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  test('all-resolved: "Create event" → /events/:id/edit — all three dishes in timeline', async ({ page }) => {
    await openReviewStep(page);

    // Resolve the two unmatched dishes as "ready to go"
    await page.getByTestId(`review-ready-${DISH_IDS.lemon}`).click();
    await page.getByTestId(`review-ready-${DISH_IDS.cheese}`).click();

    const createBtn = page.getByTestId('create-event-button');
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // EventsLibrary.handleCreated navigates to /events/:id/edit
    await page.waitForURL(/\/events\/[^/]+\/edit/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/events\/[^/]+\/edit/);

    // All three dishes should appear in the editor timeline
    await expect(page.getByText('Ribeye')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Lemon tart')).toBeVisible();
    await expect(page.getByText('Cheese plate')).toBeVisible();
  });
});
