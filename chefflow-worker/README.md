# chefflow-llm-proxy

Cloudflare Worker that backs ChefFlow:
- LLM proxy (`POST /api/llm/<endpoint>`) — verifies Clerk JWTs, rate-limits per user in KV, forwards prompts to Workers AI.
- Stripe billing (`POST /billing/checkout-session`, `POST /billing/portal-session`).
- Stripe webhook (`POST /webhook/stripe`) — flips Clerk `publicMetadata.tier` on subscription lifecycle events.
- Quota counters (`POST /quota/consume`, `GET /quota/snapshot`) — daily, per-tier.
- Community recipes (publish / list / like / copy).
- Admin endpoints (`GET /admin/*`, `POST /admin/members/:id/...`) — gated by Clerk `publicMetadata.role === 'admin'`.

---

## First-time Stripe wiring (test mode)

End-to-end runbook for getting ChefFlow Pro working from a clean slate.

### 1. Create the Stripe Product + Prices
- Stripe Dashboard → toggle **Test mode** ON (top-right).
- Products → **Add product** → name `ChefFlow Pro`.
- Add a recurring price: **£12.00 GBP / month** → save → copy the `price_…` id. This is `STRIPE_PRICE_ID_PRO_MONTHLY`.
- Add a second recurring price on the same product: **£108.00 GBP / year** → copy `price_…`. This is `STRIPE_PRICE_ID_PRO_ANNUAL`.

### 2. Grab the API keys
- Stripe Dashboard → Developers → API keys → copy the **secret key** (`sk_test_…`). This is `STRIPE_SECRET_KEY`.
- Clerk Dashboard → API Keys → copy the **secret key** (`sk_test_…`) matching the dev instance configured in `wrangler.toml` (`engaging-bat-5.clerk.accounts.dev`). This is `CLERK_SECRET_KEY`.

### 3. Set the worker secrets
From `chefflow-worker/`:
```bash
wrangler secret put CLERK_SECRET_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_PRICE_ID_PRO_MONTHLY
wrangler secret put STRIPE_PRICE_ID_PRO_ANNUAL
```
Each command prompts for the value; paste and Enter.

### 4. Deploy the worker (first time)
```bash
wrangler deploy
```
Note the deployed URL (e.g. `https://chefflow-llm-proxy.<account>.workers.dev`). The webhook in the next step targets `<that-url>/webhook/stripe`.

### 5. Register the Stripe webhook
- Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
- Endpoint URL: `https://<worker-url>/webhook/stripe`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Save → reveal **Signing secret** (`whsec_…`) → set it:
```bash
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler deploy
```

### 6. Smoke test
1. Sign in to ChefFlow as a fresh test user.
2. `/settings` → tier chip should read **Free**.
3. Click **Upgrade** in TopNav → **£12/mo** in the sheet → Stripe Checkout opens.
4. Pay with test card `4242 4242 4242 4242` (any future expiry, any CVC, any postcode).
5. Redirected to `/settings?upgraded=1`. Tier chip flips to **Pro** within ~5 seconds (Clerk metadata refetch triggered by the page).
6. Click **Manage billing** → Stripe Customer Portal opens.
7. From Stripe Dashboard → cancel the subscription → reload `/settings` → chip back to **Free**.

### Switching to live mode
Repeat steps 1–5 with test-mode toggled OFF in the Stripe Dashboard; re-run `wrangler secret put` with the live secrets (`sk_live_…`, the live `price_…` ids, the live webhook signing secret).

---

## First-time admin setup

The admin dashboard at `/admin` is gated by `publicMetadata.role === 'admin'` on the Clerk user.

1. Clerk Dashboard → Users → find your user → **Public metadata**
2. Add the key `role` with value `"admin"` (string).
3. Save → reload ChefFlow → the **Admin** nav item appears.

---

## Local development

```bash
npm run dev      # wrangler dev with hot reload
npm test         # vitest unit tests
wrangler tail    # live tail logs from a deployed worker
```
