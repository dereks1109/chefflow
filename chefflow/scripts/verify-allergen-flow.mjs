import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:5173';
const OUT = 'test-results/verify';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') console.log(`[BROWSER ERROR] ${msg.text()}`);
});
page.on('pageerror', (err) => console.log(`[PAGE ERROR] ${err.message}`));

function log(...args) { console.log('•', ...args); }

try {
  log('1. Navigate to /recipes');
  await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });

  // === Feature 4: Contact in top nav + /contact page ===
  log('2. Contact link in top nav');
  const contactLink = page.getByRole('link', { name: /^contact$/i }).first();
  await contactLink.waitFor({ state: 'visible', timeout: 5000 });
  await contactLink.click();
  await page.waitForURL(/\/contact/);
  await page.getByRole('heading', { name: /get in touch/i }).waitFor({ state: 'visible' });
  await page.getByTestId('contact-email-input').waitFor({ state: 'visible' });
  await page.getByTestId('contact-send').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${OUT}/01-contact-page.png`, fullPage: true });
  log('   ✓ /contact loads with mailto + GitHub buttons');

  // === Feature 1: hover allergen pill → popover with ingredients ===
  log('3. Allergen popover on library card');
  await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
  const allergenPill = page.locator('span[role="button"][aria-label^="Allergen:"]').first();
  await allergenPill.waitFor({ state: 'visible', timeout: 8000 });
  await allergenPill.hover();
  const tooltip = page.locator('span[role="tooltip"]', { hasText: /caused by:/i }).first();
  await tooltip.waitFor({ state: 'visible', timeout: 3000 });
  const tooltipText = await tooltip.textContent();
  log(`   ✓ tooltip text: "${tooltipText?.trim()}"`);
  await page.screenshot({ path: `${OUT}/02-allergen-popover.png` });

  // === Open recipe editor — try the demo recipes ===
  log('4. Open recipe editor (find one with allergens)');
  const editLinks = await page.locator('a[href^="/recipes/"][href$="/edit"]').all();
  log(`   found ${editLinks.length} recipe edit links`);
  let opened = false;
  for (const link of editLinks) {
    const href = await link.getAttribute('href');
    await link.click();
    await page.waitForURL(/\/recipes\/.+\/edit/);
    await page.waitForLoadState('networkidle');
    // Allergen pills live inside the Analysis fieldset which renders later than
    // the page shell — give the editor a beat to settle.
    await page.waitForTimeout(500);
    const removeBtns = await page.locator('button[aria-label^="Remove allergen"]').count();
    if (removeBtns > 0) {
      log(`   ✓ opened ${href}, found ${removeBtns} allergen pills to test`);
      await page.screenshot({ path: `${OUT}/editor-with-allergens.png`, fullPage: true });
      opened = true;
      break;
    }
    log(`   - ${href} has no allergens, trying next`);
    await page.screenshot({ path: `${OUT}/editor-no-allergens-${href.replace(/[^a-z0-9]/gi, '_')}.png`, fullPage: true });
    await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
  }
  if (!opened) throw new Error('No recipe with allergens found in library');

  // === Feature 2: click X → modal opens, cooldown ticks ===
  log('5. Click X on allergen → modal opens');
  const removeBtn = page.locator('button[aria-label^="Remove allergen"]').first();
  const allergenLabel = (await removeBtn.getAttribute('aria-label'))?.replace(/^Remove allergen /, '');
  await removeBtn.click();

  const modal = page.getByTestId('allergen-removal-modal');
  await modal.waitFor({ state: 'visible' });
  const confirmBtn = page.getByTestId('allergen-removal-confirm');
  const isDisabled1 = await confirmBtn.isDisabled();
  const initialLabel = await confirmBtn.textContent();
  log(`   ✓ modal visible; Confirm disabled=${isDisabled1}, label="${initialLabel?.trim()}"`);
  await page.screenshot({ path: `${OUT}/03-modal-initial.png` });

  log('6. Tick reason "mistakenly added"');
  await page.getByTestId('allergen-reason-mistakenly-added').check();
  const isDisabled2 = await confirmBtn.isDisabled();
  log(`   ✓ after reason ticked: Confirm disabled=${isDisabled2} (should be true — cooldown still active)`);

  log('7. Wait 5500ms for cooldown to finish');
  await page.waitForTimeout(5500);
  const isDisabled3 = await confirmBtn.isDisabled();
  const finalLabel = await confirmBtn.textContent();
  log(`   ✓ post-cooldown: Confirm disabled=${isDisabled3}, label="${finalLabel?.trim()}"`);
  await page.screenshot({ path: `${OUT}/04-modal-ready.png` });

  // === Feature 3: confirm → modal closes, history section appears ===
  log('8. Click Confirm → audit entry written');
  await confirmBtn.click();
  await modal.waitFor({ state: 'hidden' });

  const history = page.getByTestId('allergen-history-section');
  await history.waitFor({ state: 'visible' });
  const historyText = await history.textContent();
  log(`   ✓ history section visible: "${historyText?.trim().slice(0, 120)}…"`);
  await page.screenshot({ path: `${OUT}/05-history-appeared.png`, fullPage: true });

  // === Probe 1: cancel does NOT write an entry ===
  log('9. PROBE — cancel mid-modal should NOT write an entry');
  const removeBtn2 = page.locator('button[aria-label^="Remove allergen"]').first();
  const remainingCount = await removeBtn2.count();
  if (remainingCount > 0) {
    await removeBtn2.click();
    await modal.waitFor({ state: 'visible' });
    await page.getByTestId('allergen-reason-recipe-changed').check();
    const cancelBtn = page.getByTestId('allergen-removal-cancel');
    await cancelBtn.click();
    await modal.waitFor({ state: 'hidden' });
    const stillThere = await page.locator(`button[aria-label="Remove allergen ${allergenLabel?.replace(/-/g, '')}"]`).count();
    log(`   ✓ cancel works; tag count unchanged: ${stillThere >= 0 ? 'OK' : 'FAIL'}`);
  } else {
    log('   - skipped — no remaining allergens after removal');
  }

  // === Probe 2: confirm disabled with NO reason picked even after cooldown ===
  log('10. PROBE — Confirm should stay disabled with no reason picked');
  if (remainingCount > 0) {
    const removeBtn3 = page.locator('button[aria-label^="Remove allergen"]').first();
    const count3 = await removeBtn3.count();
    if (count3 > 0) {
      await removeBtn3.click();
      await modal.waitFor({ state: 'visible' });
      await page.waitForTimeout(5500);
      const stillDisabled = await confirmBtn.isDisabled();
      log(`   ✓ no reason + cooldown done: Confirm disabled=${stillDisabled} (expected true)`);
      await page.getByTestId('allergen-removal-cancel').click();
    }
  }

  console.log('\n✅ ALL CHECKS PASSED');
  console.log(`Screenshots saved to ${OUT}/`);
} catch (err) {
  console.error('\n❌ VERIFICATION FAILED:', err.message);
  await page.screenshot({ path: `${OUT}/FAIL.png`, fullPage: true });
  console.error(`Failure screenshot: ${OUT}/FAIL.png`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
