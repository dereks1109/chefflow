/**
 * E2E spec: GenerateRecipeSheet — "New recipe" button in RecipesLibrary
 *
 * CLERK GATING NOTE:
 * Runs with VITE_E2E_MODE=true (set in playwright.config.ts webServer env).
 * ClerkProvider is bypassed; routes render directly via <UngatedApp>.
 *
 * LLM MOCK (Describe tab):
 * Intercepts POST /api/llm/generate and returns a canned LlmRecipe JSON
 * wrapped in ```json fences to exercise the stripMarkdownFences path.
 * No Groq API key needed.
 *
 * KNOWN LIMITATION — Photo tab end-to-end:
 * The Photo tab UI (file input + Generate button) is tested for presence only.
 * Playwright's Chromium headless environment does not expose a real
 * camera/file picker that exercises the full downscale → base64 → vision-LLM
 * path. A complete photo-upload flow test would require:
 *   - A fixture image file fed to page.setInputFiles()
 *   - A mocked /api/llm/photo (or /api/llm/generate for proxy mode) returning a
 *     canned LlmRecipe with vision-capable fields
 * This is tracked as an open coverage gap in TEST_CASES.md.
 */

import { test, expect, type Page } from '@playwright/test';
import type { LlmRecipe } from '../src/core/recipes/llm/recipeGenSchema';

// ---------------------------------------------------------------------------
// Canned LLM response for the Describe-tab test. The proxy endpoint returns
// { content: string } where content is the raw LLM text. We wrap the JSON in
// markdown fences to exercise the stripMarkdownFences code path.
// ---------------------------------------------------------------------------
const CANNED_RECIPE: LlmRecipe = {
  title: 'Beef Bourguignon',
  originalYield: 6,
  prepTime: '30 mins',
  cookTime: '3 hours',
  ingredients: [
    { raw: '800g beef chuck', amount: 800, unit: 'g', name: 'beef chuck' },
    { raw: '200ml red wine', amount: 200, unit: 'ml', name: 'red wine' },
  ],
  steps: [
    { text: 'Brown the beef in batches.', durationSec: 600, phase: 'prep' },
    { text: 'Simmer with red wine for 3 hours.', durationSec: 10800, phase: 'cook' },
  ],
  analysis: {
    keyIngredientTags: ['beef', 'red wine'],
    allergens: [],
  },
};

const CANNED_LLM_CONTENT = '```json\n' + JSON.stringify(CANNED_RECIPE) + '\n```';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Install the window.Clerk stub + route intercept so the LLM proxy returns
 * our canned recipe without hitting the real Groq API.
 */
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

/**
 * Clear IndexedDB stores and seed flags so each test starts from a blank
 * slate. Mirrors the pattern in event-review-step.spec.ts.
 */
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
 * Navigate to /recipes, wait for the page to finish loading (either the
 * "New recipe" header button or the empty-state CTA must appear), then open
 * the GenerateRecipeSheet.
 */
async function openNewRecipeSheet(page: Page) {
  await page.goto('/recipes');
  // Either the header "New recipe" button (when library has content) or the
  // empty-state CTA "Create your first recipe" — both open the sheet.
  const newRecipeBtn = page.getByRole('button', { name: /new recipe|create your first recipe/i });
  await expect(newRecipeBtn).toBeVisible({ timeout: 15_000 });
  await newRecipeBtn.click();
  // Sheet must be visible before callers proceed.
  await expect(page.getByRole('dialog')).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('GenerateRecipeSheet — new recipe flows', () => {
  test.beforeEach(async ({ page }) => {
    await mockLlmEndpoint(page);
    await page.goto('/');
    await resetAppState(page);
  });

  // -------------------------------------------------------------------------
  test('Manual tab: "Create blank" emits a blank recipe and navigates to /recipes/<id>/edit with title "Untitled recipe"', async ({ page }) => {
    // Arrange: open the sheet; Manual tab should be active by default
    await openNewRecipeSheet(page);

    // Assert: Manual tab is active (aria-selected=true)
    const manualTab = page.getByTestId('recipe-tab-manual');
    await expect(manualTab).toHaveAttribute('aria-selected', 'true');

    // Act: click "Create blank"
    const createBlankBtn = page.getByTestId('recipe-sheet-create-blank');
    await expect(createBlankBtn).toBeVisible();
    await createBlankBtn.click();

    // Assert: navigated to /recipes/<id>/edit
    await page.waitForURL(/\/recipes\/[^/]+\/edit/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/recipes\/[^/]+\/edit/);

    // Assert: the recipe editor shows "Untitled recipe" as the title value.
    const titleInput = page.getByTestId('recipe-editor-title-input');
    await expect(titleInput).toBeVisible({ timeout: 8_000 });
    await expect(titleInput).toHaveValue('Untitled recipe');
  });

  // -------------------------------------------------------------------------
  test('Describe tab: LLM generate lands on /recipes/<id>/edit with "Beef Bourguignon" prefilled', async ({ page }) => {
    // Arrange: open sheet, switch to Describe tab
    await openNewRecipeSheet(page);

    await page.getByTestId('recipe-tab-describe').click();
    await expect(page.getByTestId('recipe-tab-describe')).toHaveAttribute('aria-selected', 'true');

    // Fill the describe textarea
    const textarea = page.getByTestId('recipe-sheet-describe-textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill('A rich Beef Bourguignon with pearl onions and mushrooms, for 6.');

    // Act: click Generate (intercepted by our LLM mock)
    await page.getByTestId('recipe-sheet-submit').click();

    // Assert: navigated to /recipes/<new-id>/edit
    await page.waitForURL(/\/recipes\/[^/]+\/edit/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/recipes\/[^/]+\/edit/);

    // Assert: the title input is prefilled with the LLM-provided title
    const titleInput = page.getByTestId('recipe-editor-title-input');
    await expect(titleInput).toBeVisible({ timeout: 8_000 });
    await expect(titleInput).toHaveValue('Beef Bourguignon');
  });

  // -------------------------------------------------------------------------
  /**
   * Photo tab — presence test only.
   *
   * KNOWN LIMITATION: we do NOT upload an actual image or trigger the
   * end-to-end vision-LLM path here. Playwright can deliver a file to the
   * hidden <input type="file"> via page.setInputFiles(), but the full round-
   * trip requires a mocked /api/llm/photo endpoint, canvas downscale support
   * in headless Chromium, and a reliable fixture image. That path is left as
   * a future integration test — see TEST_CASES.md "Open coverage gaps".
   */
  test('Photo tab: tab is selectable and shows the file input + Generate button', async ({ page }) => {
    // Arrange: open the sheet
    await openNewRecipeSheet(page);

    // Act: switch to Photo tab
    await page.getByTestId('recipe-tab-photo').click();
    await expect(page.getByTestId('recipe-tab-photo')).toHaveAttribute('aria-selected', 'true');

    // Assert: the "Choose / snap" button is visible (triggers hidden file input)
    const pickButton = page.getByTestId('recipe-sheet-photo-pick-button');
    await expect(pickButton).toBeVisible();
    await expect(pickButton).toContainText(/choose|snap/i);

    // Assert: the hidden file input is present in the DOM
    const fileInput = page.getByTestId('recipe-sheet-photo-input');
    // Note: the input is hidden (.hidden class) — we assert existence, not visibility
    await expect(fileInput).toBeAttached();

    // Assert: Generate button (recipe-sheet-submit) is visible and enabled
    const generateBtn = page.getByTestId('recipe-sheet-submit');
    await expect(generateBtn).toBeVisible();
    // Button is enabled even before a photo is picked — clicking it will show
    // an "Pick a photo first" error message (validated by handleSubmit).
    await expect(generateBtn).not.toBeDisabled();
  });
});
