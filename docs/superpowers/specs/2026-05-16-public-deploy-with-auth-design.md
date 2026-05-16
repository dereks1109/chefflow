# ChefFlow — Public Deploy with Auth (Design Spec)

**Date**: 2026-05-16
**Status**: Approved by user (sections 1–5) on 2026-05-16; ready for implementation plan.
**Author**: Brainstorm transcript with Derek

## Context

ChefFlow today is a local-only Vite SPA: data lives in IndexedDB, the Groq API key is bundled into the JS via `VITE_GROQ_API_KEY`, and the only "deploy" is `npm run dev` on the author's laptop. We want to put it on a public URL so it can be shared, with login as a soft gate so it isn't anonymous.

Three constraints surfaced during brainstorming and shape every decision below:

1. **Cost must stay zero** for any realistic demo traffic.
2. **No API key can be reachable from the browser bundle.** A public URL with a bundled Groq key is one devtools tab away from being drained.
3. **No backend database in v1.** Recipes/events stay in each user's IndexedDB — login is identity, not sync. Cross-device sync is a future scope.

## Goals

- A public URL (Cloudflare Pages, free tier) anyone can visit.
- Required sign-in via email magic-code OR "Continue with Google".
- LLM calls (generate / analyze / photo / workflow) work end-to-end with **zero API key on the client**.
- Existing app functionality is byte-identical from the user's perspective once signed in: same recipe library, same editor, same workflow page, same IndexedDB persistence.
- All existing tests (currently 234) continue to pass.

## Non-goals (v1)

- Per-user cloud storage / cross-device sync of recipes. (Punted to v2.)
- Per-browser IndexedDB namespacing by `userId`. (v1: signing in as User B on a browser previously used by User A shows A's recipes. Acceptable for "gate the demo" scope.)
- Sign-out data wipe. (v1 leaves IndexedDB intact on sign-out so sign-back-in restores.)
- Custom domain. (v1 uses `chefflow.pages.dev`.)
- "Forgot password" flows or anything beyond Clerk's defaults.

## Locked decisions

| Question | Decision | Rationale |
|---|---|---|
| What does login unlock? | Identity gate only; data stays in IndexedDB | Cheapest, no backend DB |
| LLM strategy | Cloudflare Workers AI proxy via a CF Worker | No API key in client; free tier covers demo traffic |
| Auth provider | Clerk | 10K MAU free, drop-in React SDK, both email + Google with no extra OAuth config |
| Hosting | Cloudflare Pages + Workers (same origin) | Native CF integration with Workers AI binding; same-origin avoids CORS |

## Architecture

```
User browser
└── ChefFlow SPA (Cloudflare Pages, Vite build)
    │   • Clerk <SignedIn>/<SignedOut> gates routes
    │   • IndexedDB / Dexie unchanged
    │   • LLM calls → POST /api/llm/* on same origin
    │      Authorization: Bearer <Clerk JWT>
    │
    └── /api/llm/* routes to ↓

Cloudflare Worker (chefflow-llm-proxy)
    1. verifyClerkToken(req)         → 401 on fail
    2. checkRateLimit(userId, 30/day) → 429 on fail (KV)
    3. env.AI.run('@cf/meta/...')     → no API key, internal binding
    4. return { content: rawJsonString }
```

Three deployable pieces, one Cloudflare account:

1. **`chefflow/` (existing SPA)** — built with Vite, served by Cloudflare Pages.
2. **`chefflow-worker/` (new)** — Cloudflare Worker proxying LLM calls.
3. **Clerk app** — managed in the Clerk dashboard.

## Component 1 — Auth (Clerk)

### Dashboard setup (one-time)

1. Create a Clerk app at clerk.com → name "ChefFlow".
2. Enable **Email address** with the **Email verification code** strategy.
3. Enable **Google** under Social Connections (Clerk's default OAuth credentials are sufficient for v1).
4. Record: Publishable Key (`pk_test_…` and `pk_live_…`), Frontend API URL (= JWT issuer), and the JWKS public key (for the Worker).

### Code changes — SPA

- Install `@clerk/clerk-react`.
- Wrap the app in `<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>` in `src/main.tsx`.
- Gate routes in `src/App.tsx`:
  ```tsx
  <SignedOut>  <SignInScreen />  </SignedOut>
  <SignedIn>   <Routes>…existing…</Routes>  </SignedIn>
  ```
- New component `src/ui/components/SignInScreen.tsx` (~30 lines): full-screen layout that renders Clerk's `<SignIn />` widget with `appearance` props tuned to match ChefFlow (slate borders, accent colour, Inter font).
- Add `<UserButton afterSignOutUrl="/" />` to `BottomNav` (top-right on desktop, in nav row on mobile).

### Token flow to the Worker

```ts
const token = await window.Clerk?.session?.getToken();
fetch('/api/llm/generate', {
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({...})
});
```

Clerk auto-rotates short-lived tokens; the proxy client reads the current one each call.

### Env vars

| Var | Where | Value |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | dev `.env.local` + Pages env | `pk_test_…` / `pk_live_…` |

## Component 2 — LLM proxy (Cloudflare Worker)

New repo folder `chefflow-worker/` alongside `chefflow/`.

```
chefflow-worker/
├── wrangler.toml
├── src/
│   ├── index.ts        # fetch handler — routes /api/llm/*
│   ├── auth.ts         # Clerk JWT verification (verifyToken)
│   ├── rateLimit.ts    # per-user counter in Workers KV
│   ├── generate.ts     # POST /api/llm/generate
│   ├── analyze.ts      # POST /api/llm/analyze
│   ├── photo.ts        # POST /api/llm/photo
│   └── workflow.ts     # POST /api/llm/workflow
└── package.json
```

### `wrangler.toml` bindings

```toml
name = "chefflow-llm-proxy"
main = "src/index.ts"
compatibility_date = "2026-01-15"

[ai]
binding = "AI"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "<created via: wrangler kv:namespace create RATE_LIMIT>"

[vars]
CLERK_ISSUER = "https://<your-app>.clerk.accounts.dev"

# CLERK_JWT_KEY set via: wrangler secret put CLERK_JWT_KEY
```

### Models

| Endpoint | Model | Notes |
|---|---|---|
| `/api/llm/generate`, `/analyze`, `/workflow` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Honors JSON mode; class-equivalent to Groq's `llama-3.3-70b-versatile` |
| `/api/llm/photo` | `@cf/meta/llama-3.2-11b-vision-instruct` | Vision; JSON mode less reliable → existing markdown-fence stripping in `recipeGen.ts` handles drift |

### Auth and rate-limit

- **Auth**: `@clerk/backend`'s `verifyToken({ token, jwtKey, issuer })`. Throws on bad/expired/wrong-iss tokens → 401. Returns `userId`.
- **Rate limit**: per-`userId`-per-UTC-day counter in Workers KV. Limit = 30/day. Key format `rl:<userId>:<YYYY-MM-DD>`, TTL 26h. KV has no atomic INCR but accuracy is non-critical at this scale; read-then-put is fine. Over-limit returns 429 with `Retry-After`.

### What the Worker does NOT contain

- The system prompt. The system prompt is built in the SPA (`recipeGenPrompt.ts`, `scheduler/llm/prompt.ts`) and shipped to the browser as today. The Worker only receives `{systemPrompt, userPrompt | userContent}` and forwards verbatim to `env.AI.run(...)`. This guarantees zero prompt drift between local-dev (BYO-Groq) and production.

### Worker tests

Vitest + Miniflare:

- 401 when no Authorization header.
- 401 when token's `iss` does not match `CLERK_ISSUER`.
- 200 + valid JSON content when given a valid token and a known prompt (mock `env.AI.run`).
- 429 after 31st call from the same `userId` within the UTC day.

## Component 3 — Client code changes

### New files

- **`src/core/llm/proxyClient.ts`** — `proxyComplete(input)` reads Clerk token, POSTs to `/api/llm/<endpoint>`, returns the raw JSON string ready for `parseLlmResponse` / `parseLlmRecipe` / `parseLlmAnalysis`.
- **`src/core/llm/llmClient.ts`** — single `complete(opts)` entry that branches between `proxyComplete` (production / `VITE_LLM_MODE=proxy`) and `groqComplete` (local dev / `VITE_LLM_MODE=groq`). Build-time switch via `import.meta.env`.

### Existing-file edits

- **`src/core/recipes/llm/recipeGen.ts`** — three call sites (`generateRecipeFromText`, `generateRecipeFromPhoto`, `analyzeRecipe`) switch from `import { complete } from '../../scheduler/llm/groqClient'` to `import { complete } from '../../llm/llmClient'`. Each adds an `endpoint: 'generate' | 'photo' | 'analyze'` field.
- **`src/core/scheduler/llm/llmScheduler.ts`** — `scheduleEventLLM` switches to the new `llmClient.complete` with `endpoint: 'workflow'`.
- **`src/ui/pages/Workflow.tsx`** — drops the `storedApiKey`/`envApiKey` local fallback; sign-in is mandatory before reaching the page, and the proxy reads Clerk's token, so there is no Groq key concept in the prod path.
- **`src/ui/components/GenerateRecipeSheet.tsx`** — same Groq-key-stripping in proxy mode. The "No Groq API key found" banner is hidden when `useProxy === true`.

### LlmSettingsSheet — retained but hidden in prod

The existing sheet stays in the codebase as the BYO-Groq dev fallback. Its trigger (the "Connect Groq" / "Connected" button in earlier versions of `Workflow.tsx`) is already removed; the component is dormant in proxy mode and reachable only via a future "Advanced settings" item (not in v1 scope).

### Env vars (SPA)

| Var | Build mode | Value |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | dev + prod | from Clerk dashboard |
| `VITE_LLM_MODE` | optional | `proxy` (default in prod) or `groq` (default in dev) |
| `VITE_GROQ_API_KEY` | dev only | **omitted from prod Pages env** so it cannot land in the bundle |
| `VITE_PROXY_ORIGIN` | optional | only set if SPA and Worker are on different origins; default unset (same-origin via Pages → Worker route) |

### Tests

- Keep all 234 existing tests green.
- New: `src/core/llm/proxyClient.test.ts` — success path, 401 on missing token, 429 with `Retry-After`.
- New: `src/core/llm/llmClient.test.ts` — switch picks the right backend per `VITE_LLM_MODE`.
- New: `src/ui/components/SignInScreen.test.tsx` — unauthed render asserts the sign-in CTA.
- Existing component tests using Clerk hooks (`useUser`) gain a small `test-helpers/clerkMock.tsx` so `<ClerkProvider>` is stubbed to return an authed user by default.

## Component 4 — Deployment

### One-time setup

1. Clerk dashboard → create app, enable Email-code + Google, capture keys/issuer/JWKS.
2. Create Cloudflare account.
3. `npm i -g wrangler && wrangler login`.
4. `cd chefflow-worker && wrangler kv:namespace create RATE_LIMIT` → paste ID into `wrangler.toml`.
5. `wrangler secret put CLERK_JWT_KEY` → paste JWKS PEM.
6. `wrangler deploy` → first Worker push.
7. dash.cloudflare.com → Pages → "Connect to Git" → build cmd `cd chefflow && npm ci && npm run build`, output `chefflow/dist`. Env var: `VITE_CLERK_PUBLISHABLE_KEY=pk_live_…`. Deploy.
8. Pages → Functions → add route `/api/llm/*` → Worker service `chefflow-llm-proxy`. (Same-origin: no CORS, no `VITE_PROXY_ORIGIN` needed.)
9. Clerk → Authorized Origins → add `https://chefflow.pages.dev`.

### Subsequent deploys

- **SPA**: `git push` → CF Pages auto-deploys.
- **Worker**: `cd chefflow-worker && wrangler deploy` (manual in v1; a GitHub Action can automate later).

### Local dev workflow (unchanged-ish)

- Terminal 1: `cd chefflow && npm run dev` (still on `http://localhost:5174`).
- `.env.local` sets `VITE_LLM_MODE=groq` and `VITE_GROQ_API_KEY=gsk_…` so dev talks to Groq directly without spinning up a Worker.
- (Optional) Terminal 2: `cd chefflow-worker && wrangler dev` + flip `VITE_LLM_MODE=proxy` + `VITE_PROXY_ORIGIN=http://localhost:8787` to exercise the proxy locally.

## Acceptance criteria

The deploy is "done" when all of the following hold on the live URL:

1. `grep -r "gsk_" chefflow/dist/` on the production build output returns **zero matches**. The bundle contains no Groq key.
2. Visiting `chefflow.pages.dev` in an incognito browser shows Clerk's sign-in widget — no app UI is reachable without authentication.
3. Sign-in succeeds via email magic code and lands on the Recipes library.
4. Sign-in succeeds via "Continue with Google" and lands on the Recipes library.
5. Recipes → New recipe → Describe → "Beef Bourguignon, 4 portions" → Generate produces a populated recipe in the editor. Network tab shows `/api/llm/generate` returned 200 and contained no Groq-key-shaped header.
6. Editor → Analyse with AI populates kcal + tags + allergen pills.
7. New recipe → Photo → printed-recipe upload populates the editor.
8. Demo Event → Generate Workflow renders Prep / Cook / Serve phases.
9. Manually firing `fetch('/api/llm/generate', {method:'POST', body:'{}'})` from devtools with no Authorization header returns **401**.
10. Looping 31 generate calls from the same signed-in user returns 30 × 200 then 1 × **429** with a `Retry-After` header.
11. Sign-out via the top-right `UserButton` redirects to the sign-in screen.
12. `npx tsc --noEmit` and `npx vitest run` pass in both `chefflow/` and `chefflow-worker/`.

## Risks and watch-items

- **CF Workers AI free-tier neuron budget** (~10K/day). Heavy traffic returns 5xx from CF until UTC midnight; the existing red error banner in `GenerateRecipeSheet` will surface it. Spec adds a more specific message for the CF AI rate-limit error code.
- **Clerk free MAU cap** (10K). Not a near-term concern at demo traffic; flagged for future.
- **Per-browser IndexedDB**. Sign-in as User B on the same browser previously used by User A reveals A's recipes. Accepted v1 trade-off; called out in the README ("v1 limitation: data is per-browser, not per-user").
- **Vision-model JSON-mode unreliability** on CF's Llama-vision. Existing markdown-fence stripping in `recipeGen.ts` handles drift; no extra work.
- **Settings watcher reload caveat** (Claude Code-side, separate from this deploy): if the future PreCompact hook or other settings additions are made mid-session, the watcher may not reload — call out in `~/.claude/` docs, not relevant to ChefFlow runtime.

## Rollback

- **SPA**: CF Pages → Deployments → previous green build → "Rollback" (one click).
- **Worker**: `wrangler rollback` or redeploy a known-good commit. Independent of SPA — either can be rolled back alone.

## Out-of-scope follow-ups (v2 candidates)

- Per-user IndexedDB namespacing keyed on Clerk `userId`, with lazy migration for existing local data.
- "Wipe my local data" affordance on sign-out.
- Cloud-sync of recipes (would flip Decision 1 from "gate-the-demo" to "cloud-sync SaaS").
- Custom domain (e.g. `chefflow.app`) instead of `pages.dev`.
- Server-side prompt versioning, so the worker can refuse stale-prompt clients during a rollout.
- Per-user "bring your own Groq key" override that bypasses the proxy's rate limit (hybrid path).
