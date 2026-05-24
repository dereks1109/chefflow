# Deploying ChefFlow

ChefFlow ships as two artefacts:

1. **Worker** (`chefflow-worker/`) — Cloudflare Worker exposing
   `/api/llm/*`, `/api/sync/*`, `/api/account/*`, and `/api/health`.
2. **SPA** (`chefflow/`) — Vite-built React app deployed to
   Cloudflare Pages.

Both are free-tier eligible. The first deploy needs ~1 hour. You need a
Cloudflare account, a Clerk account, and `npx wrangler` in your shell.

## One-off setup

### 1 — Provision D1 (the sync database)

```sh
cd chefflow-worker
npx wrangler login
npx wrangler d1 create chefflow
# Wrangler prints a `database_id`. Paste that UUID into wrangler.toml,
# replacing the `REPLACE_WITH_D1_DATABASE_ID` placeholder.
```

Apply the schema migrations to the remote D1:

```sh
npx wrangler d1 migrations apply chefflow --remote
```

### 2 — Set up Clerk (production)

1. Create a new Clerk application (don't reuse the dev one).
2. Add `https://chefflow.pages.dev` (or your custom domain) to
   **Domains → Authorised**.
3. Copy the **Publishable key** (`pk_live_…`) and **Secret key**
   (`sk_live_…`).
4. Note the **Frontend API URL** (looks like
   `https://clerk.your-app.com` or `https://your-app.clerk.accounts.dev`).
   This is the value for `CLERK_ISSUER`.

In `chefflow-worker/wrangler.toml`, update:

```toml
[vars]
CLERK_ISSUER = "https://your-clerk-frontend-api.clerk.accounts.dev"
```

Set the Worker secret (this writes to Cloudflare, not to git):

```sh
cd chefflow-worker
npx wrangler secret put CLERK_SECRET_KEY
# Paste sk_live_… when prompted.
```

### 3 — Deploy the Worker

```sh
cd chefflow-worker
npx wrangler deploy
# Note the URL it prints: https://chefflow-llm-proxy.<your-subdomain>.workers.dev
```

Smoke-test that auth is wired:

```sh
curl -i https://chefflow-llm-proxy.<your-subdomain>.workers.dev/api/llm/generate -X POST -d '{}'
# Expect: HTTP/2 401  ("Missing or invalid Authorization header")
curl -i https://chefflow-llm-proxy.<your-subdomain>.workers.dev/api/health
# Expect: HTTP/2 200  {"ok":true,...}
```

### 4 — Deploy the SPA to Cloudflare Pages

In the Cloudflare dashboard → **Workers & Pages → Create application →
Pages → Connect to Git**:

| Setting | Value |
|---|---|
| Repository | dereks1109/chefflow |
| Production branch | `main` (or whichever branch you ship from) |
| Build command | `cd chefflow && npm ci && npm run build` |
| Build output directory | `chefflow/dist` |
| Root directory | (leave blank) |

Under **Settings → Environment variables**, add (Production scope):

- `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_…`
- `VITE_LLM_MODE` = `proxy`
- *(optional)* `VITE_GOOGLE_MAPS_API_KEY` = your Maps key
- *(optional, post-Sentry setup)* `VITE_SENTRY_DSN` = your DSN

Do **NOT** set `VITE_GROQ_API_KEY` in production — the proxy path doesn't
need it and shipping a key in the SPA bundle leaks it to every visitor.

Trigger the first deploy. You'll get a `chefflow.pages.dev` URL.

### 5 — Wire Pages → Worker (the binding)

In the Pages project → **Settings → Functions → Service bindings**:

| Variable | Service | Environment |
|---|---|---|
| `LLM_PROXY` | `chefflow-llm-proxy` | Production |

This is what makes `chefflow/public/_routes.json` route `/api/*` to the
Worker. **Re-add this binding if you ever delete and recreate the Pages
project** — it lives in the dashboard, not in code.

### 6 — Add the Pages URL to Clerk

In Clerk → **Domains**, add:

- `https://chefflow.pages.dev`
- (later) your custom domain

## Smoke test the full stack

1. Visit `https://chefflow.pages.dev`.
2. Sign up with a new email. You should land on `/recipes` with three
   demo recipes seeded.
3. Click "Generate Workflow" on the demo event — confirms the proxy
   binding is live.
4. Open DevTools → Network. Confirm `/api/llm/workflow` returns 200 and
   never carries a `gsk_…` Authorization header (only `Bearer
   <clerk-jwt>`).

## Rotating secrets

```sh
# Rotate the Clerk secret key in the Clerk dashboard, then:
cd chefflow-worker
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler deploy
```

For `VITE_CLERK_PUBLISHABLE_KEY`, update it in the Pages dashboard and
trigger a redeploy.

## Rolling back

In Cloudflare → Pages → Deployments → click the previous successful
deploy → **Rollback to this deployment**. Worker rollback:
`npx wrangler rollback` from `chefflow-worker/`.

## Custom domain (later)

1. Buy domain (e.g. `chefflow.com`).
2. Cloudflare → Pages → Custom domains → Set up a domain. Follow the
   DNS instructions.
3. Add the custom domain to Clerk → Domains.
4. Update `chefflow-worker/wrangler.toml` `CLERK_ISSUER` if Clerk gives
   you a new Frontend API URL for the custom domain.

## Cost notes (free-tier ceilings as of writing)

- **Clerk** — 10k MAU free. Google OAuth uses Clerk's shared
  credentials (consent screen shows "via clerk.com") until you bring
  your own Google OAuth app.
- **Cloudflare Workers AI** — generous compute credits on the free
  plan; Workers AI is included.
- **D1** — 5 GB + 5 M reads/day free. Per-user payload row in
  `recipes`/`events` is ~5 KB on average; you'd hit 5 GB at roughly
  1000 users × 1000 rows each.
- **Pages** — unlimited bandwidth, 500 builds/month free.

## Backups

Schedule a weekly D1 export via GitHub Actions cron or run locally:

```sh
cd chefflow-worker
npx wrangler d1 export chefflow --remote --output "backup-$(date +%F).sql"
```

Commit backups to a private repo or upload to R2 — they contain user
PII (recipe contents, event contacts) so they're not for the public
repo.
