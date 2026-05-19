/**
 * E2E spec: GenerateEventSheet — Review step state machine
 *
 * CLERK GATING NOTE:
 * This spec runs with VITE_E2E_MODE=true (set in playwright.config.ts webServer
 * env). In E2E mode, main.tsx skips ClerkProvider and App.tsx renders routes
 * directly via <UngatedApp>. No live Clerk account or network call to
 * clerk.accounts.dev is required.
 *
 * LLM MOCK:
 * The spec intercepts POST /api/llm/generate (the proxy endpoint that
 * proxyClient.ts calls in VITE_LLM_MODE=proxy mode) and returns a canned
 * two-dish KitchenEvent JSON payload. This keeps the test deterministic and
 * offline — no Groq API key is needed.
 *
 * DISH ID ASSUMPTION:
 * parseLlmEvent assigns deterministic dish ids: "d1", "d2", ... based on array
 * index (see eventGen.ts parseDishes). The mock payload produces dishes with
 * those ids, so data-testid selectors are predictable.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Canned LLM response. proxyClient.ts expects { content: string } where
// content is the raw text the LLM would have returned. parseLlmEvent then
// JSON-parses content. We wrap the JSON string in ```json fences to also
// exercise the stripMarkdownFences path.
// ---------------------------------------------------------------------------
const CANNED_EVENT_JSON = {
  title: 'Saturday Dinner',
  serveAt: '2026-06-14T19:00:00.000Z',
  location: 'Home kitchen',
  notes: '6 guests',
  dishes: [
    { name: 'Beef Bourguignon', portions: 6, startAt: '2026-06-14T17:00:00.000Z' },
    { name: 'Lemon Tart', portions: 6, startAt: '2026-06-14T18:30:00.000Z' },
  ],
};

// Wrap in markdown fences to exercise stripMarkdownFences — matches real LLM output
const CANNED_LLM_CONTENT = '```json\n' + JSON.stringify(CANNED_EVENT_JSON) + '\n```';

// Dish ids are assigned by parseLlmEvent as d1, d2 based on array index
const DISH_IDS = { bourguignon: 'd1', tart: 'd2' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Route the proxy LLM endpoint to return our canned payload and inject a
 * stub window.Clerk so proxyClient.ts can retrieve a fake JWT without a
 * live Clerk session.
 *
 * Must be called before navigating to the events page.
 */
async function mockLlmEndpoint(page: Page) {
  // Inject a minimal window.Clerk stub before any script runs. proxyClient.ts
  // calls window.Clerk?.session?.getToken() to get the auth token. Returning a
  // fake string bypasses the "Not signed in" guard without a live Clerk session.
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Clerk = {
      session: {
        getToken: () => Promise.resolve('fake-e2e-jwt'),
      },
    };
  });

  // Intercept the proxy endpoint so no real network call is made.
  await page.route('**/api/llm/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: CANNED_LLM_CONTENT }),
    });
  });
}

/**
 * Clear app state so each test starts from a known baseline.
 *
 * Strategy: clear the Dexie stores directly (rather than deleting the whole
 * DB) to avoid IDB blocking issues when Dexie still holds an open connection.
 * Clearing stores + wiping seed flags causes App's useEffect to re-seed demo
 * data on the next page load.
 */
async function resetAppState(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      // Open at the current version (no upgrade needed — just clearing data).
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
      // If DB doesn't exist yet, onupgradeneeded fires with empty stores — nothing to clear.
      req.onupgradeneeded = () => {
        const db = req.result;
        db.close();
        resolve();
      };
    });
  });
  await page.evaluate(() => {
    // Clear seed flags so demo data re-seeds on next page load
    localStorage.removeItem('chefflow:seeded-demo-v3');
    localStorage.removeItem('chefflow:seeded-demo-events-v4');
    // Clear any lingering review draft from a previous test
    sessionStorage.removeItem('chefflow:event-review-draft');
  });
}

/**
 * Navigate to /events and open the GenerateEventSheet in Describe mode,
 * fill in the textarea, and click Extract event. Waits for the Review step
 * to appear before returning.
 *
 * @param afterPageLoad - optional async callback invoked after the page is
 *   ready but before the sheet is opened. Use this to seed test data into
 *   the IndexedDB while the DB connection is already open at the correct
 *   schema version.
 */
async function openReviewStep(page: Page, afterPageLoad?: () => Promise<void>) {
  await page.goto('/events');
  // Wait for the page to boot (seeding completes, "New event" button appears)
  const newEventBtn = page.getByRole('button', { name: /new event|create your first event/i });
  await expect(newEventBtn).toBeVisible({ timeout: 15_000 });

  // Run any pre-submit setup (e.g. inserting test recipes into IDB)
  if (afterPageLoad) await afterPageLoad();

  await newEventBtn.click();

  // Switch to the "Extract from text" tab
  await page.getByRole('tab', { name: /extract from text/i }).click();

  // Fill the description textarea
  const textarea = page.getByTestId('event-description-textarea');
  await expect(textarea).toBeVisible();
  await textarea.fill('Saturday dinner, 6 guests. Beef bourguignon and lemon tart.');

  // Mock is already installed; click Extract event
  await page.getByTestId('generate-event-button').click();

  // Wait for the review step — both dish rows must appear
  await expect(page.getByTestId('review-dish-row')).toHaveCount(2, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('GenerateEventSheet — Review step', () => {
  test.beforeEach(async ({ page }) => {
    // Install the LLM intercept before any navigation so it's active when
    // the sheet submits the extraction request.
    await mockLlmEndpoint(page);

    // Navigate to the app once to establish the browsing context, then clear
    // IDB and seed flags so each test starts from a clean slate.
    // openReviewStep will navigate to /events again — the second load picks up
    // the clean state and re-seeds demo data (because seed flags were cleared).
    await page.goto('/');
    await resetAppState(page);
  });

  // -------------------------------------------------------------------------
  test('both dish rows render with unresolved (red-border) state on entry', async ({ page }) => {
    // Arrange: navigate to events and trigger extraction
    await openReviewStep(page);

    // Assert: both rows exist
    const rows = page.getByTestId('review-dish-row');
    await expect(rows).toHaveCount(2);

    // Both rows should indicate they need attention (no choice made yet)
    await expect(rows.nth(0)).toHaveAttribute('data-needs-attention', 'true');
    await expect(rows.nth(1)).toHaveAttribute('data-needs-attention', 'true');

    // "Create event" must be disabled — not all dishes resolved
    const createBtn = page.getByTestId('create-event-button');
    await expect(createBtn).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  test('auto-match: a dish whose title exists in the recipe library gets linked automatically', async ({ page }) => {
    // The demo seed creates "(Demo) Ribeye", "(Demo) Garden Salad",
    // "(Demo) Tomato Basil Soup". Our canned event has "Beef Bourguignon" and
    // "Lemon Tart" — neither matches, so we seed an exact-match recipe.
    //
    // The seed is injected via afterPageLoad so the DB is already open at v3
    // when we write to it — avoids schema mismatch from opening at v1.
    await openReviewStep(page, async () => {
      await page.evaluate(() => {
        return new Promise<void>((resolve, reject) => {
          // DB is already open by Dexie at v3; opening without a version
          // re-uses the existing connection version.
          const req = indexedDB.open('chefflow');
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('recipes', 'readwrite');
            tx.objectStore('recipes').put({
              id: 'r_test_bourguignon',
              title: 'Beef Bourguignon',
              originalYield: 6,
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
    });

    // data-dish-id is on the same <li> as data-testid="review-dish-row",
    // so we select with a combined attribute CSS selector, not filter({has}).
    const bourRow = page.locator(
      `[data-testid="review-dish-row"][data-dish-id="${DISH_IDS.bourguignon}"]`
    );
    // The "Beef Bourguignon" row should be auto-matched (no longer needs attention)
    await expect(bourRow).toHaveAttribute('data-needs-attention', 'false');

    // The matched row should display "Linked to recipe" text
    await expect(bourRow).toContainText('Linked to recipe');
    await expect(bourRow).toContainText('Beef Bourguignon');

    // The "Lemon Tart" row is still unresolved
    const tartRow = page.locator(
      `[data-testid="review-dish-row"][data-dish-id="${DISH_IDS.tart}"]`
    );
    await expect(tartRow).toHaveAttribute('data-needs-attention', 'true');
  });

  // -------------------------------------------------------------------------
  test('"The dish is ready to go" clears red border and persists the choice', async ({ page }) => {
    await openReviewStep(page);

    const tartRow = page.locator(`[data-testid="review-dish-row"][data-dish-id="${DISH_IDS.tart}"]`);
    await expect(tartRow).toHaveAttribute('data-needs-attention', 'true');

    // Act: click "The dish is ready to go" for the Lemon Tart row
    const readyBtn = page.getByTestId(`review-ready-${DISH_IDS.tart}`);
    await expect(readyBtn).toBeVisible();
    await readyBtn.click();

    // Assert: row border clears (needs-attention becomes false)
    await expect(tartRow).toHaveAttribute('data-needs-attention', 'false');

    // Choice persists — clicking elsewhere doesn't reset it. Verify by
    // confirming the other dish row still needs attention (state is isolated).
    const bourRow = page.locator(`[data-testid="review-dish-row"][data-dish-id="${DISH_IDS.bourguignon}"]`);
    await expect(bourRow).toHaveAttribute('data-needs-attention', 'true');

    // "Create event" still disabled — bourguignon still unresolved
    await expect(page.getByTestId('create-event-button')).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  test('"Create event" enables only once all dishes have a resolution', async ({ page }) => {
    await openReviewStep(page);

    const createBtn = page.getByTestId('create-event-button');

    // Initially disabled
    await expect(createBtn).toBeDisabled();

    // Resolve dish 1 (Beef Bourguignon) as "ready to go"
    await page.getByTestId(`review-ready-${DISH_IDS.bourguignon}`).click();
    // Still disabled — dish 2 unresolved
    await expect(createBtn).toBeDisabled();

    // Resolve dish 2 (Lemon Tart) as "ready to go"
    await page.getByTestId(`review-ready-${DISH_IDS.tart}`).click();
    // Now enabled — both dishes resolved
    await expect(createBtn).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  test('"Create event" navigates to the event editor after all dishes resolved', async ({ page }) => {
    await openReviewStep(page);

    // Resolve both dishes
    await page.getByTestId(`review-ready-${DISH_IDS.bourguignon}`).click();
    await page.getByTestId(`review-ready-${DISH_IDS.tart}`).click();

    const createBtn = page.getByTestId('create-event-button');
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // After finalising, the app saves the event and navigates to /events/:id/edit
    await page.waitForURL(/\/events\/[^/]+\/edit/);
    await expect(page).toHaveURL(/\/events\/[^/]+\/edit/);
  });

  // -------------------------------------------------------------------------
  test('"The dish is ready to go" choice is cleared when Search picker is opened for that dish', async ({ page }) => {
    await openReviewStep(page);

    // First mark Lemon Tart as ready
    await page.getByTestId(`review-ready-${DISH_IDS.tart}`).click();
    const tartRow = page.locator(`[data-testid="review-dish-row"][data-dish-id="${DISH_IDS.tart}"]`);
    await expect(tartRow).toHaveAttribute('data-needs-attention', 'false');

    // Now open the search picker for the same dish — this should clear the "ready" choice
    await page.getByTestId(`review-search-${DISH_IDS.tart}`).click();

    // Row should revert to needs-attention (ready choice cleared)
    await expect(tartRow).toHaveAttribute('data-needs-attention', 'true');

    // The search picker (Filter recipes input) should be visible
    await expect(page.getByLabel('Filter recipes')).toBeVisible();
  });
});
