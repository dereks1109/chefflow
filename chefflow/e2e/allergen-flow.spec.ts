import { test, expect } from '@playwright/test';

// Verification spec for the four allergen + contact features just landed.
// Uses the (Demo) Black Pepper Sauce recipe seeded by seed.ts which has milk
// allergens (butter + cream) so the popover + removal flow are exercisable.

test('allergen popover, removal modal with 5s cooldown, history, contact page', async ({ page }) => {
  // Boot
  await page.goto('/recipes');
  await expect(page).toHaveURL(/\/recipes/);

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
  await allergenPill.hover();
  const tooltip = page.locator('span[role="tooltip"]', { hasText: /caused by:/i }).first();
  await expect(tooltip).toBeVisible();
  await page.screenshot({ path: 'test-results/allergen-popover.png' });

  // --- Open the recipe so we can exercise the removal modal ---
  // Click the recipe card title link (Demo Ribeye, Demo Pepper Sauce, etc.)
  // Card links go to /recipes/:id/edit.
  await page.locator('a[href^="/recipes/"][href$="/edit"]').first().click();
  await expect(page).toHaveURL(/\/recipes\/.+\/edit/);

  // --- Feature 2: click X on an allergen pill in editor → modal opens, cooldown ticks ---
  // EditablePill's X button has aria-label "Remove allergen <label>". Click the first one.
  const removeBtn = page.locator('button[aria-label^="Remove allergen"]').first();
  if (await removeBtn.count() === 0) {
    // This recipe has no allergens to remove — try the next recipe.
    await page.goto('/recipes');
    await page.locator('a[href^="/recipes/"][href$="/edit"]').nth(1).click();
  }
  await removeBtn.click();

  // Modal visible
  const modal = page.getByTestId('allergen-removal-modal');
  await expect(modal).toBeVisible();
  const confirmBtn = page.getByTestId('allergen-removal-confirm');
  // Confirm starts disabled (no reason + cooldown active)
  await expect(confirmBtn).toBeDisabled();
  // Button label shows countdown
  await expect(confirmBtn).toHaveText(/Confirm removal \(\d\)/);
  await page.screenshot({ path: 'test-results/removal-modal-initial.png' });

  // Tick a reason
  await page.getByTestId('allergen-reason-mistakenly-added').check();
  // Still disabled (cooldown not done)
  await expect(confirmBtn).toBeDisabled();

  // Wait 5s for cooldown
  await page.waitForTimeout(5500);
  await expect(confirmBtn).toBeEnabled();
  await expect(confirmBtn).toHaveText(/Confirm removal$/);

  // --- Feature 3: confirm → modal closes, history section appears ---
  await confirmBtn.click();
  await expect(modal).toBeHidden();

  // History section should now be visible with the new audit entry.
  const history = page.getByTestId('allergen-history-section');
  await expect(history).toBeVisible();
  await expect(history).toContainText(/Allergen history \(\d+\)/);
  await expect(history).toContainText(/accidentally or mistakenly added/i);
  await page.screenshot({ path: 'test-results/history-section.png', fullPage: true });
});
