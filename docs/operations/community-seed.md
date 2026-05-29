# Community starter recipes — runbook

**One-shot.** Run once after the worker is provisioned in production to
seed the community library with 8 curated starter recipes attributed
to `admin@chefflow.uk`. Re-runs are idempotent (skips already-published
titles).

## Why

The 2026-05-29 UX audit flagged the community-library empty state as a
chicken-and-egg dead-end for new chefs. These 8 starter recipes give
every signed-out + signed-in visitor something to browse without
requiring the chef to publish their own first.

## What gets published

8 recipes spanning cuisines + dietary categories:

| # | Title | Allergens |
|---|---|---|
| 1 | Classic Roast Beef Sirloin | — |
| 2 | Vegan Mushroom Risotto | — |
| 3 | Pan-Seared Salmon with Lemon Butter | Fish, Milk |
| 4 | Chicken Tikka Masala | Milk |
| 5 | Classic Caesar Salad | Eggs, Fish, Milk, Gluten |
| 6 | Chocolate Lava Cake | Eggs, Milk, Gluten |
| 7 | Lemon Herb Roast Potatoes | — |
| 8 | Quick Tomato Pasta | Gluten |

Payloads in `chefflow-worker/scripts/starter-recipes.json`.

## How to run

1. **Sign in** to https://chefflow.uk as `admin@chefflow.uk`.

2. **Set the display name** in Settings → Profile to `ChefFlow Team`
   (or whatever attribution you want on the cards). Tick **"Show my
   name on community recipes"**. Save.

3. **Copy your Clerk session JWT**:
   - Open Chrome DevTools → Application → Cookies → `https://chefflow.uk`.
   - Find the cookie named `__session`.
   - Copy its value (a long JWT string).

4. **Find your Clerk user id**:
   - Same Application tab → Local Storage → `https://chefflow.uk`.
   - Look for `__clerk_db_jwt_*` or check the URL of a previously-
     published recipe (it'll contain `user_xxx…`).
   - Alternatively: run a quick curl against your own community page:
     ```
     curl -s https://api.chefflow.uk/community/list | grep -o 'user_[A-Za-z0-9]*' | head -1
     ```

5. **Run the script** (from the worker directory):
   ```sh
   cd chefflow-worker
   export ADMIN_CLERK_JWT='<paste from step 3>'
   export ADMIN_CLERK_USER_ID='<paste from step 4>'
   npx tsx scripts/publish-starter-recipes.ts
   ```

6. **Verify**: open https://chefflow.uk/community in an incognito
   window. All 8 recipes should appear with `ChefFlow Team` as the
   author.

7. **Cleanup**: unset the JWT env var so it's not lingering in your
   shell history.
   ```sh
   unset ADMIN_CLERK_JWT
   unset ADMIN_CLERK_USER_ID
   ```

## Troubleshooting

- **401 Unauthorized**: the JWT has expired (Clerk tokens live for
  ~5 minutes). Re-copy it from DevTools.
- **400 "Body must be ..."**: the recipe shape in JSON has drifted
  from the worker's expected `SourceRecipe` type. Check
  `chefflow-worker/src/community.ts` for the current contract.
- **Recipes appear but with wrong author name**: you didn't set
  `Show my name on community recipes` in step 2, OR Clerk
  `publicMetadata.displayName` is empty. Update it in
  Settings → Profile and unpublish + re-run.
- **Some recipes skipped after a first failed run**: idempotency
  worked correctly — the partial set published OK, the rest skipped
  on the second try.

## Re-publishing after content updates

If you edit `starter-recipes.json` and want to push the new content:

1. Unpublish the old versions from `/community/by-author/<id>` (manual
   for now — each recipe has a delete button in your admin UI).
2. Re-run the script.

A `--force` flag could be added in future to unpublish + re-publish
in one pass; not built yet because the use case is rare.
