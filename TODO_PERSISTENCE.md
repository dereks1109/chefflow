# TODO_PERSISTENCE — Live Session State

> Agent-owned snapshot of *current-session* unfinished work. Auto-dumped near context cap, auto-cleaned the moment a task is confirmed working. Stays lean — done items go to `git log` and (for durable threads) `ToDoList.md` "✅ Recently done".
>
> See [CLAUDE.md § Agent Protocol — State Persistence](CLAUDE.md#-agent-protocol--state-persistence) for the contract.

**Last dumped:** 2026-05-20 — post logo + event-page refinements + QA re-test batch.

---

## In-flight tasks

EventView design question (from Fullstack Engineer agent):

- [ ] Decide whether section management and drag-reorder should migrate onto `chefflow/src/ui/pages/EventView.tsx`, or stay behind the "Advanced (sections, dishes)" link in `chefflow/src/ui/components/EventDetailsSheet.tsx`. Currently `/events/:id/edit` (full EventEditor) is the only path for those capabilities.

QA gaps (from QA-engineer agent, also in `chefflow/e2e/TEST_CASES.md` "Open coverage gaps"):

- [ ] Photo-upload recipe gen — `chefflow/e2e/recipe-new.spec.ts` flags this but doesn't end-to-end test it (no real file upload).
- [ ] Workflow page interactions — `chefflow/src/ui/pages/Workflow.tsx` has no E2E coverage.
- [ ] Drag-and-drop section management on EventEditor — `@hello-pangea/dnd` interactions not covered.
- [ ] Sign-in flow — Clerk-bypassed in all current specs; no real auth round-trip.
- [ ] "Create new recipe → return to review" full resume path — mount-order race in `chefflow/src/ui/pages/EventsLibrary.tsx` makes deterministic testing brittle.

Legal pages (carried over — pre-launch blockers):

- [ ] Replace `privacy contact email pending` placeholder in `chefflow/src/ui/pages/legal/PrivacyPage.tsx` with a real DSAR address.
- [ ] Confirm Groq UK IDTA / DPA status and update `PrivacyPage.tsx` + `TermsPage.tsx` copy.
- [ ] UK-qualified solicitor review of all four pages — especially allergen-liability waivers.
- [ ] Verify Clerk DPA URL `https://clerk.com/legal/dpa` still resolves before launch.
- [ ] Implement JSON export for IndexedDB data — Right-to-Portability copy is aspirational until this lands.
- [ ] Add legal links + acceptance line to `chefflow/src/ui/components/SignInScreen.tsx`.

Production cutover:

- [ ] Set production env vars in Cloudflare project: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_LLM_MODE=proxy`.
- [ ] **Never** set `VITE_E2E_MODE=true` in production (bypasses Clerk auth). Test environments only.
- [ ] Add prod referrer to Google Maps API key in GCP — `https://*.chefflow-derek.workers.dev/*` + custom domain.

P0 regulatory (legal-owner work):

- [ ] Register with ICO as a UK data controller.
- [ ] Sign DPAs with Clerk + Cloudflare + Google Maps.

## Refactors pending

_(none)_

## Bug states

_(none)_
