# Deployment

> **NOTE:** Full deployment is in progress on branch `feat/public-deploy-with-auth`. The steps below reflect the target architecture as confirmed by the code in `chefflow-worker/` and the plan in `docs/superpowers/plans/2026-05-16-public-deploy-with-auth.md`. Some steps (Cloudflare Pages configuration, DNS) require Cloudflare dashboard access and cannot be verified from the repo alone.

## Target architecture

Three deployable pieces:

1. **Vite SPA** (`chefflow/`) — built to static files; served by Cloudflare Pages.
2. **Cloudflare Worker** (`chefflow-worker/`) — verifies Clerk JWTs, rate-limits, proxies LLM calls to Workers AI.
3. **Cloudflare Pages routing** — serves the SPA and routes `/api/llm/*` requests to the Worker.

## Environment variables

### SPA (`chefflow/`)

Set these as environment variables in Cloudflare Pages (Settings → Environment Variables):

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key from the Clerk dashboard |
| `VITE_LLM_MODE` | Yes | Set to `proxy` for production |
| `VITE_GROQ_API_KEY` | No | Not needed in proxy mode |
| `VITE_GOOGLE_MAPS_API_KEY` | No | Enables LocationAutocomplete in EventEditor |

### Cloudflare Worker (`chefflow-worker/`)

Non-secret variables are in `wrangler.toml`:

| Variable | Value |
|----------|-------|
| `CLERK_ISSUER` | Your Clerk issuer URL (e.g. `https://engaging-bat-5.clerk.accounts.dev`) |
| `DAILY_LIMIT` | Per-user daily LLM request cap (default `30`) |

Secrets must be set via `wrangler secret put` (not stored in the repo):

| Secret | Description |
|--------|-------------|
| `CLERK_SECRET_KEY` | Clerk backend secret key from the Clerk dashboard |

## Build command

```bash
# From chefflow/
npm run build
```

Output goes to `chefflow/dist/`. Cloudflare Pages build settings:

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `chefflow` |

## Worker deployment

```bash
# From chefflow-worker/
npm run deploy
```

This runs `wrangler deploy`. You must be authenticated (`wrangler login`) and have the `AI` binding and `RATE_LIMIT` KV namespace provisioned in your Cloudflare account.

KV namespace setup (one-time):

```bash
wrangler kv:namespace create RATE_LIMIT
# Copy the returned id into wrangler.toml [[kv_namespaces]] id field
```

## Worker endpoints

The Worker serves at `/api/llm/{endpoint}`. All requests must include a Clerk Bearer token.

| Endpoint | Model | Description |
|----------|-------|-------------|
| `POST /api/llm/generate` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Generate a recipe from text |
| `POST /api/llm/analyze` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Analyze recipe ingredients/allergens |
| `POST /api/llm/workflow` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Generate a kitchen workflow |
| `POST /api/llm/photo` | `@cf/meta/llama-3.2-11b-vision-instruct` | Generate a recipe from a photo |

### Request format

```json
{
  "systemPrompt": "string (required)",
  "userPrompt": "string (optional)",
  "userContent": "string | MultimodalPart[] (optional)",
  "jsonMode": true
}
```

### Response format

```json
{
  "content": "string"
}
```

### Error responses

| Status | Meaning |
|--------|---------|
| 400 | Missing or invalid request body |
| 401 | Missing or invalid Clerk JWT |
| 404 | Unknown endpoint |
| 429 | Daily quota exceeded (includes `Retry-After` header) |
| 502 | Workers AI error |

## Rate limiting

The Worker enforces a per-user daily quota using Workers KV. The limit is set by the `DAILY_LIMIT` environment variable (default: `30` calls/day). The KV key format is `quota:{userId}:{YYYY-MM-DD}`.

## Cloudflare Pages routing

To route `/api/llm/*` to the Worker on the same domain as the SPA, configure a Pages Function or a `_routes.json` file.

> **TODO: confirm with maintainer** — The exact `_routes.json` or Pages Functions configuration is defined in the deploy plan (`docs/superpowers/plans/2026-05-16-public-deploy-with-auth.md`, Tasks 18–22) but has not yet been committed to the repo.

## Local development with proxy mode

To test the proxy path locally:

1. Start the Worker: `cd chefflow-worker && npm run dev` (runs on `http://localhost:8787`)
2. Set `VITE_LLM_MODE=proxy` in `chefflow/.env`
3. The SPA's `proxyClient.ts` posts to the same origin by default. For cross-origin local dev, pass an `origin` override.

> **TIP:** For day-to-day local development, leave `VITE_LLM_MODE` unset (or set to `groq`) and provide `VITE_GROQ_API_KEY`. This avoids the need to run the Worker locally.
