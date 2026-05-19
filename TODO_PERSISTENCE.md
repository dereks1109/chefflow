# TODO_PERSISTENCE — Live Session State

> Agent-owned snapshot of *current-session* unfinished work. Auto-dumped near context cap, auto-cleaned the moment a task is confirmed working. Stays lean — done items go to `git log` and (for durable threads) `ToDoList.md` "✅ Recently done".
>
> See [CLAUDE.md § Agent Protocol — State Persistence](CLAUDE.md#-agent-protocol--state-persistence) for the contract.

**Last dumped:** 2026-05-19 — post second parallel-dispatch (legal copy + architecture doc + EventView restructure).

---

## In-flight tasks

Legal pages — pre-launch blockers:

- [ ] Replace `privacy contact email pending` placeholder in `chefflow/src/ui/pages/legal/PrivacyPage.tsx` with a real DSAR address (UK GDPR Article 13 requirement).
- [ ] Confirm Groq UK IDTA / DPA status and update `PrivacyPage.tsx` + `TermsPage.tsx` copy (current draft flags it as pending — largest legal exposure).
- [ ] UK-qualified solicitor review of all four pages — especially allergen-liability waivers in `TermsPage.tsx` + `DisclaimerPage.tsx`.
- [ ] Verify Clerk DPA URL `https://clerk.com/legal/dpa` still resolves before launch.
- [ ] Implement JSON export for IndexedDB data — `PrivacyPage.tsx` "Right to Portability" is aspirational until this lands.
- [ ] Add legal links + acceptance line to `chefflow/src/ui/components/SignInScreen.tsx`.

Production cutover:

- [ ] Set production env vars in Cloudflare project: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_LLM_MODE=proxy`.
- [ ] **Never** set `VITE_E2E_MODE=true` in production (bypasses Clerk auth). Test environments only.
- [ ] Add prod referrer to Google Maps API key in GCP — `https://*.chefflow-derek.workers.dev/*` + custom domain.

P0 regulatory (legal-owner work):

- [ ] Register with ICO as a UK data controller (per `docs/plans/uk-regulatory-roadmap.md`).
- [ ] Sign DPAs with Clerk + Cloudflare + Google Maps.

## Refactors pending

_(none)_

## Bug states

_(none)_
