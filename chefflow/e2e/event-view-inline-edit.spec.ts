/**
 * E2E spec: EventView — inline dish field editing
 *
 * Tests the inline editing affordances on the EventView page (/events/:id),
 * added in the inline-edit feature (commit fd1c3e7). Each editable field on
 * a DishRow — name, portions, notes — can be toggled to an input on click,
 * committed with Enter or blur, and cancelled with Escape. The EventDetailsSheet
 * covers event-level metadata (title, budget, etc.).
 *
 * CLERK GATING NOTE:
 * Runs with VITE_E2E_MODE=true; no live Clerk session required.
 *
 * SEEDING STRATEGY:
 * A KitchenEvent with two dishes is written directly to IndexedDB before each
 * test. The event id and dish ids are hardcoded so selectors are stable.
 * resetAppState() clears all IDB stores before writing fresh seed data.
 *
 * PERSISTENCE ASSERTIONS:
 * Fields that are committed (not cancelled) are verified both in the live DOM
 * and after a full page reload to confirm the change was written through to
 * IndexedDB via saveEvent().
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Stable IDs for the seeded test event and dishes
// ---------------------------------------------------------------------------
const EVENT_ID = 'e_test_inline_edit';
const DISH_1_ID = 'dish_test_01';
const DISH_2_ID = 'dish_test_02';

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

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
 * Write a KitchenEvent with two dishes into IndexedDB. Called after resetAppState
 * so the IDB already exists at v3; opening without a version re-uses it.
 */
async function seedTestEvent(page: Page) {
  const eventId = EVENT_ID;
  const dish1Id = DISH_1_ID;
  const dish2Id = DISH_2_ID;

  await page.evaluate(
    ({ eventId, dish1Id, dish2Id }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('chefflow');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('events', 'readwrite');
          const now = Date.now();
          tx.objectStore('events').put({
            id: eventId,
            title: 'Test Dinner',
            notes: '',
            dishes: [
              {
                id: dish1Id,
                name: 'Roast Chicken',
                portions: 4,
                startAt: '2026-08-01T18:00:00.000Z',
                notes: 'Original notes',
              },
              {
                id: dish2Id,
                name: 'Caesar Salad',
                portions: 2,
                startAt: '2026-08-01T17:30:00.000Z',
              },
            ],
            createdAt: now,
            updatedAt: now,
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        req.onerror = () => reject(req.error);
      });
    },
    { eventId, dish1Id, dish2Id },
  );
}

/** Navigate to the EventView page and wait for it to be ready. */
async function goToEventView(page: Page) {
  await page.goto(`/events/${EVENT_ID}`);
  // EventView shows the event title in an h1 once it loads from IDB
  await expect(page.getByTestId('event-view-title')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('event-view-title')).toHaveText('Test Dinner');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('EventView — inline dish editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetAppState(page);
    await seedTestEvent(page);
  });

  // -------------------------------------------------------------------------
  test('a. EventDetailsSheet: edit title + budget → Save → EventView updates without navigating away', async ({ page }) => {
    await goToEventView(page);

    // Act: click the Edit event details pencil icon
    // EventDetailCard renames `event-view-edit-details` → `event-detail-card-edit`
    // when it was extracted into the shared component (see commit 1bc960d).
    await page.getByTestId('event-detail-card-edit').click();

    // Assert: EventDetailsSheet opens
    const dialog = page.getByRole('dialog', { name: /event details/i });
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // Edit the title
    const titleInput = page.getByTestId('event-details-title-input');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Gala Dinner');

    // Edit the budget
    const budgetInput = page.getByRole('spinbutton', { name: /budget/i });
    await expect(budgetInput).toBeVisible();
    await budgetInput.fill('500');

    // Act: click Save
    await page.getByTestId('event-details-save').click();

    // Assert: dialog closes
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Assert: still on EventView (no navigation away)
    await expect(page).toHaveURL(new RegExp(`/events/${EVENT_ID}$`));

    // Assert: title updated on the page
    await expect(page.getByTestId('event-view-title')).toHaveText('Gala Dinner');
  });

  // -------------------------------------------------------------------------
  test('b. Inline name edit: click dish name → type → Enter → row re-renders → persists on reload', async ({ page }) => {
    await goToEventView(page);

    // Identify the DishRow for dish 1 by data-dish-id
    const dish1Row = page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_1_ID}"]`);
    await expect(dish1Row).toBeVisible();

    // Act: click the dish name button to enter edit mode
    const nameButton = dish1Row.getByRole('button', { name: /edit name for dish/i });
    await expect(nameButton).toBeVisible();
    await nameButton.click();

    // Assert: an input appears
    const nameInput = dish1Row.getByRole('textbox', { name: /dish.*name/i });
    await expect(nameInput).toBeVisible();

    // Type a new name and commit with Enter
    await nameInput.fill('Herb-Roasted Chicken');
    await nameInput.press('Enter');

    // Assert: input gone, new name rendered as button text
    await expect(nameInput).not.toBeVisible();
    await expect(dish1Row).toContainText('Herb-Roasted Chicken');

    // Assert: persists after full page reload (written to IDB via saveEvent)
    await page.reload();
    await expect(page.getByTestId('event-view-title')).toBeVisible({ timeout: 10_000 });
    const dish1RowAfterReload = page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_1_ID}"]`);
    await expect(dish1RowAfterReload).toContainText('Herb-Roasted Chicken');
  });

  // -------------------------------------------------------------------------
  test('c. Inline portions edit: click portions → number input → change → Enter → re-renders + persists', async ({ page }) => {
    await goToEventView(page);

    const dish1Row = page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_1_ID}"]`);

    // Act: click the portions button (shows "4 portions")
    const portionsButton = dish1Row.getByRole('button', { name: /edit portions for dish/i });
    await portionsButton.click();

    // Assert: number input appears
    const portionsInput = dish1Row.getByRole('spinbutton', { name: /portions for dish/i });
    await expect(portionsInput).toBeVisible();
    await portionsInput.fill('8');
    await portionsInput.press('Enter');

    // Assert: input gone, new value rendered
    await expect(portionsInput).not.toBeVisible();
    await expect(dish1Row).toContainText('8 portions');

    // Assert: persists after reload
    await page.reload();
    await expect(page.getByTestId('event-view-title')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_1_ID}"]`),
    ).toContainText('8 portions');
  });

  // -------------------------------------------------------------------------
  test('d. Inline notes edit: click notes → textarea → change → Enter → persists', async ({ page }) => {
    await goToEventView(page);

    const dish1Row = page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_1_ID}"]`);

    // The dish has "Original notes" seeded. Clicking the notes paragraph opens
    // the textarea (DishRow renders notes as a clickable <button> when onNotesChange is set).
    const notesButton = dish1Row.getByRole('button', { name: /edit notes for dish/i });
    await expect(notesButton).toBeVisible();
    await notesButton.click();

    // Assert: textarea appears
    const notesTextarea = dish1Row.getByRole('textbox', { name: /notes for dish/i });
    await expect(notesTextarea).toBeVisible();

    // Type new notes and commit with Enter (Shift+Enter would add a newline)
    await notesTextarea.fill('Updated notes for the chicken dish');
    await notesTextarea.press('Enter');

    // Assert: textarea gone, new notes visible as button text
    await expect(notesTextarea).not.toBeVisible();
    await expect(dish1Row).toContainText('Updated notes for the chicken dish');

    // Assert: persists after reload
    await page.reload();
    await expect(page.getByTestId('event-view-title')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_1_ID}"]`),
    ).toContainText('Updated notes for the chicken dish');
  });

  // -------------------------------------------------------------------------
  test('e. Trash icon: confirm → dish disappears from timeline', async ({ page }) => {
    await goToEventView(page);

    // Both dishes should be present initially
    await expect(page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_1_ID}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_2_ID}"]`)).toBeVisible();

    // Mock window.confirm to accept automatically
    page.on('dialog', (dialog) => void dialog.accept());

    // Act: click trash on dish 1
    const dish1Row = page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_1_ID}"]`);
    await dish1Row.getByTestId('dish-row-remove').click();

    // Assert: dish 1 disappears; dish 2 remains
    await expect(
      page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_1_ID}"]`),
    ).not.toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator(`[data-testid="dish-row"][data-dish-id="${DISH_2_ID}"]`),
    ).toBeVisible();

    // Assert: still on EventView (no navigation away)
    await expect(page).toHaveURL(new RegExp(`/events/${EVENT_ID}$`));
  });
});
