# TODO_PERSISTENCE — Live Session State

> Agent-owned snapshot of *current-session* unfinished work. Auto-dumped near context cap, auto-cleaned the moment a task is confirmed working. Stays lean — done items go to `git log` and (for durable threads) `ToDoList.md` "✅ Recently done".
>
> See [CLAUDE.md § Agent Protocol — State Persistence](CLAUDE.md#-agent-protocol--state-persistence) for the contract.

**Last dumped:** 2026-05-18 — five parallel-agent plans landed, awaiting implementation choice.

---

## In-flight tasks

Plans written this session (all in `docs/plans/`):

- [ ] **Fullstack workflow fixes** — `docs/plans/fullstack-workflow-fixes.md`. (a) Migrate `chefflow/src/core/events/llm/eventGen.ts:124` and `chefflow/src/core/events/llm/menuCheck.ts:120` to the shared `stripMarkdownFences`. (b) Add workflow indicator to `chefflow/src/ui/components/EventCard.tsx` + back-to-event breadcrumb in `chefflow/src/ui/pages/Workflow.tsx`. (c) Click-to-edit dish time in `chefflow/src/ui/components/DishRow.tsx` + thread `onTimeChange` via `DraggableDish` in `chefflow/src/ui/pages/EventEditor.tsx`.
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
