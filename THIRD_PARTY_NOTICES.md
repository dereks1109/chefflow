# Third-Party Notices

ChefFlow is licensed under the MIT License (see `LICENSE`).

## Seed content

The demo recipes ("Ribeye", "Garden Salad", "Tomato Basil Soup") and the
demo event in `chefflow/src/db/seed.ts` are original works authored for
ChefFlow. They are not transcribed from any cookbook, blog, or other
third-party source. They are covered by ChefFlow's MIT license alongside
the rest of the codebase.

The allergen taxonomy in `chefflow/src/core/recipes/llm/allergens.ts`
uses the UK Food Standards Agency's 14-allergen statutory list. The list
itself is regulatory information, not a copyrightable compilation; the
display labels and example ingredients are original ChefFlow phrasing.

The culinary scheduling axioms in `CulinaryRule.md` are original
ChefFlow content (not transcribed from any cookbook or published
scheduling text).

## Runtime dependencies

ChefFlow depends on the npm packages declared in `chefflow/package.json`
and `chefflow-worker/package.json`. Each package retains its own
license. Generate a current per-package report with:

```sh
cd chefflow && npx license-checker --summary
cd chefflow-worker && npx license-checker --summary
```

At the time of writing the dependency set is composed of permissive
licenses (MIT, Apache-2.0, ISC, BSD-2/3-Clause). No GPL, AGPL, or SSPL
dependencies are bundled into the production build.

## Third-party services

ChefFlow integrates with the following hosted services. Each has its own
terms of service and data-processing policy that apply to data
transmitted while using ChefFlow:

- **Clerk** — authentication (`https://clerk.com/legal`)
- **Cloudflare** — Pages hosting, Workers, D1 database, Workers AI
  (`https://www.cloudflare.com/trust-hub/`)
- **Google Maps Platform** — Places Autocomplete in the event location
  field (`https://cloud.google.com/maps-platform/terms`)
- **Groq** (optional, bring-your-own-key local dev path) —
  `https://groq.com/terms-of-use/`

When ChefFlow is deployed publicly, end-user-facing disclosure of these
processors belongs in the deployment's privacy policy (not yet
authored — see plan in
`/root/.claude/plans/1-make-every-user-serene-leaf.md`).
