# Google Maps API setup for the Workflow commute banner

The Workflow page's "Leave by X to arrive on time" banner uses
Google's Distance Matrix API. Until the worker secret is set, the
banner stays hidden. Setup takes ~10 minutes.

Cost: $0.005 USD per request. Google gives every billing account a
$200/month free credit which covers ~40,000 requests — far above
ChefFlow's expected volume (each chef opens a workflow N times per
event).

---

## Step 1 — Enable Distance Matrix API

In the same Google Cloud project you used for [Gmail OAuth setup](./gmail-oauth-setup.md)
(or a fresh project — either is fine):

1. APIs & Services → Library → search **Distance Matrix API** → Enable.

## Step 2 — Create an API key

1. APIs & Services → Credentials → Create Credentials → **API key**.
2. Click the new key to edit it:
   - **Application restrictions** — pick "None" for now (HTTP-referrer
     restrictions don't work for server-to-server worker calls; IP
     restriction would require pinning Cloudflare's worker IP range
     which changes).
   - **API restrictions** — Restrict to: tick **Distance Matrix API**
     only. Minimises blast radius if the key leaks.
3. Copy the key (starts with `AIza`).

## Step 3 — Set the Cloudflare worker secret

```sh
cd chefflow-worker
wrangler secret put GOOGLE_MAPS_API_KEY
# paste the key from Step 2
```

## Step 4 — Set your home address in ChefFlow Settings

The banner only fires when BOTH:
- Worker has `GOOGLE_MAPS_API_KEY` set (Step 3), AND
- Chef has a home address in `Settings → Profile → Home address`.

Open chefflow.uk → Settings → Profile section → fill in the "Home
address" field (free-form — Google's geocoder handles the parsing).

## Step 5 — Verify

Open any event with a `location` set. Click "Workflow" (top-right CTA
on the event view). Below the EventDetailCard you should see a sky-
blue banner:

> 🚗 **27 min** drive (12.4 km) from your home to *Buckingham Palace, London SW1A 1AA, UK*. Leave by 18:33 to arrive 30 min before service.

If the banner doesn't appear:
- Open browser devtools → Console. Failures log
  `[commute] estimate failed: <fallback>`.
- `no-key` → secret wasn't set (re-run Step 3).
- `maps-failed` → check `wrangler tail` for the worker-side error.
  Common: API key has the wrong restriction, or Distance Matrix API
  isn't enabled for that key.
- Banner hidden silently → either your home address is empty or the
  event has no `location`.

## Cost control

Each workflow page open triggers ONE estimate call. At $0.005/call
the $200 monthly free credit covers ~40,000 estimates — you'd need
1,300 events per day with one workflow-open each to start paying.

If you want a harder ceiling, set a per-user daily quota in
`worker:src/commute.ts` (track in KV similar to the LLM quota gate);
currently there's no limit so a bug in the SPA that re-mounted the
banner in a render loop could rack up calls fast.
