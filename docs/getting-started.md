# Getting Started

This guide takes you from a fresh clone to a running local dev server.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 LTS or later |
| npm | 10 or later (bundled with Node 20) |

> **NOTE:** The Cloudflare Worker (`chefflow-worker/`) is optional for local development. The SPA defaults to direct Groq API calls when `VITE_LLM_MODE` is not set to `proxy`.

## 1. Clone the repository

```bash
git clone <repo-url>
cd "vs code"
```

## 2. Install SPA dependencies

```bash
cd chefflow
npm install
```

## 3. Configure environment variables

The SPA reads four `VITE_` variables from a `.env` file in the `chefflow/` directory. Create one before starting the dev server:

```bash
# chefflow/.env  (git-ignored — do not commit this file)

# Clerk publishable key — get from https://dashboard.clerk.com
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# LLM mode: "groq" (direct, local dev) or "proxy" (Cloudflare Worker, production)
# Leave unset or set to "groq" for local development.
VITE_LLM_MODE=groq

# Groq API key — only needed when VITE_LLM_MODE=groq
# Get one at https://console.groq.com/keys
VITE_GROQ_API_KEY=gsk_...

# Google Maps API key — only needed for the LocationAutocomplete component
VITE_GOOGLE_MAPS_API_KEY=AIza...
```

> **IMPORTANT:** `VITE_CLERK_PUBLISHABLE_KEY` is required. The app wraps every route in a Clerk `<SignedIn>` gate and will render only a sign-in screen without it.

> **TIP:** `VITE_GOOGLE_MAPS_API_KEY` is optional. If omitted, the location field in the Event editor falls back to a plain text input instead of the autocomplete widget.

## 4. Start the development server

```bash
# From the chefflow/ directory
npm run dev
```

Vite starts on `http://localhost:5173` by default. The first time the app loads it seeds three demo recipes and one demo event into IndexedDB automatically.

## 5. Verify the setup

1. Open `http://localhost:5173` in your browser.
2. Sign in with Clerk (email or Google, depending on your Clerk app configuration).
3. You should be redirected to `/recipes` and see three demo recipes: Ribeye, Garden Salad, and Tomato Basil Soup.

## Available scripts

All scripts run from the `chefflow/` directory.

| Script | Command | What it does |
|--------|---------|--------------|
| Dev server | `npm run dev` | Start Vite dev server with HMR |
| Production build | `npm run build` | Type-check then bundle with Vite |
| Preview build | `npm run preview` | Serve the production build locally |
| Lint | `npm run lint` | Run ESLint across all source files |
| Tests (watch) | `npm run test` | Run Vitest in watch mode |
| Tests (CI) | `npm run test:run` | Run Vitest once and exit |

## Cloudflare Worker (optional)

The `chefflow-worker/` package is a separate Node project. You only need it locally if you want to test the proxy LLM path (`VITE_LLM_MODE=proxy`).

```bash
cd chefflow-worker
npm install
npm run dev      # starts wrangler dev on http://localhost:8787
```

The Worker requires two secrets set via `wrangler secret put` (or `.dev.vars` for local dev):

| Secret | Description |
|--------|-------------|
| `CLERK_SECRET_KEY` | Clerk backend secret key — found in the Clerk dashboard |

Two non-secret variables are already in `wrangler.toml`:

| Variable | Value in `wrangler.toml` |
|----------|--------------------------|
| `CLERK_ISSUER` | Your Clerk issuer URL |
| `DAILY_LIMIT` | Per-user daily LLM request cap (default `30`) |

> **NOTE:** The Worker uses a Workers AI binding (`AI`) and a Workers KV namespace (`RATE_LIMIT`). These are only available when running through `wrangler dev` or deployed to Cloudflare — they cannot be tested with plain Node.

Worker scripts:

| Script | Command |
|--------|---------|
| Local dev | `npm run dev` |
| Deploy | `npm run deploy` |
| Tests | `npm run test` |
| Type-check | `npm run typecheck` |

## Demo data

On first load the app writes demo data to IndexedDB via `chefflow/src/db/seed.ts`. The seed is guarded by localStorage flags (`chefflow:seeded-demo-v3`, `chefflow:seeded-demo-events-v4`). To reset:

1. Open DevTools → Application → IndexedDB → delete the `chefflow` database.
2. Open Application → Local Storage → delete the `chefflow:seeded-*` keys.
3. Reload the page.
