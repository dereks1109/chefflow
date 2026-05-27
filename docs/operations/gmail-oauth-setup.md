# Gmail OAuth setup for the daily inbox digest

One-time setup so the ChefFlow worker can read admin@chefflow.uk's
inbox and email a priority-grouped digest each morning. Until you
finish all four steps below the cron fires harmlessly and logs
`{"skipReason":"no-secrets"}` to the worker tail.

Total time: ~20 minutes.

---

## Step 1 — Create a Google Cloud project (or reuse one)

1. Open https://console.cloud.google.com/
2. New Project → name it "ChefFlow Ops" (any name works).
3. Make sure the new project is selected (top-bar project switcher).

## Step 2 — Enable the Gmail API

1. APIs & Services → Library → search **Gmail API** → Enable.

## Step 3 — Create an OAuth consent screen + Web Client

1. APIs & Services → OAuth consent screen.
   - User Type: **External**.
   - App name: `ChefFlow Ops`.
   - User support email: admin@chefflow.uk.
   - Developer contact: admin@chefflow.uk.
   - Scopes: **add** `https://www.googleapis.com/auth/gmail.readonly`.
   - Test users: add **admin@chefflow.uk**.
   - Publishing status: leave as **Testing** — fine for a single-account use.

2. APIs & Services → Credentials → Create Credentials → **OAuth Client ID**.
   - Application type: **Web application**.
   - Name: `ChefFlow Worker`.
   - Authorised redirect URIs: `https://developers.google.com/oauthplayground`.
   - Click Create.
   - Copy the **Client ID** and **Client secret**.

## Step 4 — Get a refresh token via OAuth Playground

1. Open https://developers.google.com/oauthplayground.
2. Top-right gear icon → tick **Use your own OAuth credentials** → paste the
   Client ID + Client secret from Step 3.
3. Left pane → scroll to **Gmail API v1** → tick
   `https://www.googleapis.com/auth/gmail.readonly`.
4. Click **Authorize APIs**. Sign in as `admin@chefflow.uk`. On the
   "Google hasn't verified this app" screen click Advanced → Go to
   ChefFlow Ops (unsafe). Approve the scope.
5. Click **Exchange authorization code for tokens**.
6. Copy the **Refresh token** (long string starting with `1//`).

## Step 5 — Store the three secrets on the worker

```sh
cd chefflow-worker
wrangler secret put GOOGLE_OAUTH_CLIENT_ID
# paste the Client ID from Step 3

wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
# paste the Client secret from Step 3

wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN
# paste the Refresh token from Step 4
```

## Step 6 — Trigger the cron manually to verify

```sh
# Force the cron to fire right now (instead of waiting for 07:30 UTC).
npx wrangler triggers cron --schedule "30 7 * * *"
# Or just tail logs + wait for the scheduled firing tomorrow morning.
npx wrangler tail
```

The digest should arrive at admin@chefflow.uk within ~1 minute of the
trigger. If it doesn't, check `npx wrangler tail` for the
`[cron:gmail-digest]` log line — the JSON shows `skipReason` if
anything failed (e.g. `no-messages`, `gmail-failed`, `llm-failed`,
`send-failed`).

## Troubleshooting

- **`skipReason: "no-secrets"`** — one of the three secrets is missing.
  Re-run Step 5.
- **`skipReason: "gmail-failed"`** — refresh token may have expired
  (you revoked consent in your Google account) or the OAuth app is in
  Testing mode and the refresh token has expired (Google ages them
  after ~7 days for Testing-status apps). Either re-run Step 4 to get
  a fresh refresh token, OR publish the OAuth consent screen
  (Production status) so refresh tokens last indefinitely. For a
  single-account use, periodic refresh is acceptable.
- **No email arrives but logs say `sent: true`** — check spam folder.
  Pre-2026-05-26 the From was `onboarding@resend.dev`; now it's
  `noreply@chefflow.uk` (verified domain).
