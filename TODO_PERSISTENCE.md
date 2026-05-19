# TODO_PERSISTENCE — Live Session State

> Agent-owned snapshot of *current-session* unfinished work. Auto-dumped near context cap, auto-cleaned the moment a task is confirmed working. Stays lean — done items go to `git log` and (for durable threads) `ToDoList.md` "✅ Recently done".
>
> See [CLAUDE.md § Agent Protocol — State Persistence](CLAUDE.md#-agent-protocol--state-persistence) for the contract.

**Last dumped:** 2026-05-19 — post parallel-dispatch (cookie banner + Playwright + docs).

---

## In-flight tasks

Surfaced by the cookie-banner + legal-pages agent:

- [ ] Draft real legal copy for the four placeholder pages — `chefflow/src/ui/pages/legal/{Terms,Privacy,Cookies,Disclaimer}Page.tsx`.
- [ ] Add legal links + acceptance line to the sign-in screen — `chefflow/src/ui/components/SignInScreen.tsx`.
- [ ] Surface a DSAR / privacy contact email constant once provided — `chefflow/src/ui/pages/legal/PrivacyPage.tsx`.
- [ ] Decide static-HTML vs. Vite-bundled rendering for legal pages (plan §Open Items) — `chefflow/src/App.tsx` + Cloudflare Worker config.

Production cutover items (still pending):

- [ ] Set production env vars in Cloudflare project: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_LLM_MODE=proxy`.
- [ ] **Never** set `VITE_E2E_MODE=true` in production (it bypasses Clerk auth). Only test environments.
- [ ] Add prod referrer to Google Maps API key in GCP — `https://*.chefflow-derek.workers.dev/*` + any custom domain.

P0 regulatory (legal-owner work, can't be coded):

- [ ] Register with ICO as a UK data controller (per `docs/plans/uk-regulatory-roadmap.md`).
- [ ] Confirm Groq UK IDTA / DPA before public launch — largest legal exposure.
- [ ] Sign DPAs with Clerk + Cloudflare + Google Maps.

## Refactors pending

_(none)_

## Bug states

_(none)_
