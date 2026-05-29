/**
 * publish-starter-recipes.ts
 *
 * One-shot script. Publishes the 8 curated recipes in
 * `scripts/starter-recipes.json` to the community library via the
 * existing /community/publish worker endpoint, attributed to
 * admin@chefflow.uk.
 *
 * Why: the UX audit (docs/ux-audit-2026-05-29.md, rec #4) flagged
 * the community empty-state as a chicken-and-egg: "Publish one of
 * yours" is no help to a chef arriving on a freshly-seeded platform.
 * These 8 starter recipes give every visitor something to browse.
 *
 * Idempotency: the script fetches /community/by-author/<adminClerkId>
 * first and skips publishing any recipe whose title is already in
 * the community library. Safe to re-run.
 *
 * Usage:
 *   1. Sign in to https://chefflow.uk as admin@chefflow.uk.
 *   2. Open dev tools → Application tab → Cookies → copy the value of
 *      the `__session` cookie (Clerk's session JWT).
 *   3. Run:
 *        cd chefflow-worker
 *        export ADMIN_CLERK_JWT='<paste the JWT>'
 *        export ADMIN_CLERK_USER_ID='<your Clerk user id, e.g. user_xxx>'
 *        npx tsx scripts/publish-starter-recipes.ts
 *
 *      Optional flags:
 *        DISPLAY_NAME='ChefFlow Team'  (defaults to 'ChefFlow Team')
 *        WORKER_BASE='https://api.chefflow.uk'  (defaults to prod)
 *
 *   4. Verify: visit /community signed-out → all 8 should appear.
 *
 * Cleanup: the JWT expires within minutes — unset the env var when
 * done (`unset ADMIN_CLERK_JWT`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECIPES_PATH = path.join(__dirname, 'starter-recipes.json');

const WORKER_BASE = process.env.WORKER_BASE ?? 'https://api.chefflow.uk';
const JWT = process.env.ADMIN_CLERK_JWT;
const ADMIN_CLERK_USER_ID = process.env.ADMIN_CLERK_USER_ID;
const DISPLAY_NAME = process.env.DISPLAY_NAME ?? 'ChefFlow Team';

interface StarterRecipe {
  id: string;
  title: string;
  description?: string;
  originalYield: number;
  prepTime?: string;
  cookTime?: string;
  ingredients: unknown[];
  steps: unknown[];
  allergens?: string[];
}

interface CommunityRecipeSummary {
  id: string;
  title: string;
}

async function main(): Promise<void> {
  if (!JWT) {
    console.error('ADMIN_CLERK_JWT env var is required. See script header for instructions.');
    process.exit(1);
  }
  if (!ADMIN_CLERK_USER_ID) {
    console.error('ADMIN_CLERK_USER_ID env var is required (e.g. user_xxx). See script header.');
    process.exit(1);
  }

  const recipes = JSON.parse(fs.readFileSync(RECIPES_PATH, 'utf8')) as StarterRecipe[];
  console.log(`Loaded ${recipes.length} starter recipes from ${RECIPES_PATH}`);
  console.log(`Worker base: ${WORKER_BASE}`);
  console.log(`Author display name: ${DISPLAY_NAME}`);
  console.log('');

  // Idempotency check: skip recipes whose title is already published
  // by this admin account.
  const byAuthorRes = await fetch(
    `${WORKER_BASE}/community/by-author/${encodeURIComponent(ADMIN_CLERK_USER_ID)}`,
    { method: 'GET' },
  );
  if (!byAuthorRes.ok) {
    console.error(`Failed to fetch existing publications: ${byAuthorRes.status}`);
    process.exit(1);
  }
  const { items: existing } = (await byAuthorRes.json()) as { items: CommunityRecipeSummary[] };
  const existingTitles = new Set(existing.map((r) => r.title.toLowerCase()));
  console.log(`Found ${existing.length} existing publications by this author. Will skip duplicates.`);
  console.log('');

  let published = 0;
  let skipped = 0;
  for (const recipe of recipes) {
    if (existingTitles.has(recipe.title.toLowerCase())) {
      console.log(`⏭  ${recipe.title} — already published, skipping`);
      skipped += 1;
      continue;
    }

    const res = await fetch(`${WORKER_BASE}/community/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${JWT}`,
      },
      body: JSON.stringify({ recipe, displayName: DISPLAY_NAME }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`❌ ${recipe.title} — failed (${res.status}): ${text.slice(0, 200)}`);
      continue;
    }
    const { id } = (await res.json()) as { id: string };
    console.log(`✅ ${recipe.title} — published as ${id}`);
    published += 1;
  }

  console.log('');
  console.log(`Done. Published ${published}, skipped ${skipped}, total ${recipes.length}.`);
  console.log(`Verify: open ${WORKER_BASE.replace('api.', '')}/community in an incognito window.`);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
