# TODO_PERSISTENCE — Live Session State

> Agent-owned snapshot of *current-session* unfinished work. Auto-dumped near context cap, auto-cleaned the moment a task is confirmed working. Stays lean — done items go to `git log` and (for durable threads) `ToDoList.md` "✅ Recently done".
>
> See [CLAUDE.md § Agent Protocol — State Persistence](CLAUDE.md#-agent-protocol--state-persistence) for the contract.

**Last dumped:** 2026-05-18 — five parallel-agent plans landed, awaiting implementation choice.

---

## In-flight tasks

Plans written this session (all in `docs/plans/`):

<!-- All three sub-tasks from docs/plans/fullstack-workflow-fixes.md shipped this session:
     (a) eventGen.ts + menuCheck.ts migrated to shared stripMarkdownFences.
     (b) EventCard workflow indicator + Workflow back-to-event breadcrumb.
     (c) Click-to-edit dish time in DishRow + EventEditor wiring + 4 unit tests. -->
- [ ] **Legal pages + cookie banner** — `docs/plans/legal-policies-cookie-banner.md`. Add `chefflow/src/ui/components/ConsentBanner.tsx`, routes `/terms /privacy /cookies /disclaimer` via a `LegalLayout` in `chefflow/src/App.tsx`, persistence key `chefflow:cookie-consent-v1`.
- [ ] **UK regulatory P0 items** — `docs/plans/uk-regulatory-roadmap.md`. ICO registration (legal-only). Groq UK IDTA / DPA outreach (legal-only, biggest exposure). DPA confirmation with Clerk/Cloudflare/Google.
- [ ] **QA Playwright suite** — `docs/plans/qa-test-coverage.md`. Top-5 E2E tests; biggest gap is `GenerateEventSheet` Review-step state machine. Needs `data-testid` additions on drag handles + section name inputs.
- [ ] **Docs additions** — `docs/plans/project-architecture-docs.md`. Mermaid sequence diagram in `docs/architecture.md`; agent-protocol cross-ref in `docs/contributing.md`; resolve `_routes.json` TODO in `docs/deployment.md`.

Production cutover items (still pending from previous session):

- [ ] Set production env vars in Cloudflare project: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_LLM_MODE=proxy`.
- [ ] Add prod referrer to Google Maps API key in GCP — `https://*.chefflow-derek.workers.dev/*` + any custom domain.

## Refactors pending

_(none)_

## Bug states

_(none)_
