import { chromium } from '@playwright/test';

const URL = 'https://chefflow.uk';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}\n${err.stack ?? ''}`));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000); // give React a beat to mount

const rootHtml = await page.locator('#root').innerHTML();
console.log('--- #root contents (first 500 chars) ---');
console.log(rootHtml.slice(0, 500));
console.log(`(total ${rootHtml.length} chars)`);

console.log('\n--- PAGE ERRORS ---');
for (const e of pageErrors) console.log(e);

console.log('\n--- CONSOLE ERRORS ---');
for (const e of consoleErrors) console.log(e);

await page.screenshot({ path: 'test-results/prod-blank.png', fullPage: true });
console.log('\nScreenshot saved to test-results/prod-blank.png');

await browser.close();
