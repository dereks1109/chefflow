# TODO_PERSISTENCE — Live Session State

> Agent-owned snapshot of *current-session* unfinished work. Auto-dumped near context cap, auto-cleaned the moment a task is confirmed working. Stays lean — done items go to `git log` and (for durable threads) `ToDoList.md` "✅ Recently done".
>
> See [CLAUDE.md § Agent Protocol — State Persistence](CLAUDE.md#-agent-protocol--state-persistence) for the contract.

**Last dumped:** 2026-05-18 — pre-push workflow-JSON-fix + EventView-linkage commit.

---

## In-flight tasks

- [ ] Browser smoke-test the workflow fix on demo event — `chefflow/src/ui/pages/EventView.tsx`, `chefflow/src/ui/pages/Workflow.tsx`. (Tests pass + build green; user-side click-through still pending.)
- [ ] Commit + push the workflow-fix + EventView-linkage changes — `chefflow/src/core/llm/stripMarkdownFences.ts`, `chefflow/src/core/llm/stripMarkdownFences.test.ts`, `chefflow/src/core/recipes/llm/recipeGen.ts`, `chefflow/src/core/scheduler/llm/llmScheduler.ts`, `chefflow/src/core/scheduler/llm/llmScheduler.test.ts`, `chefflow/src/ui/pages/EventView.tsx`, `chefflow/src/ui/pages/Workflow.tsx`.
- [ ] Set production env vars in Cloudflare project (Variables and Secrets → Production): `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_LLM_MODE=proxy`. Required for the live deploy to render past the MissingEnvScreen.
- [ ] Add prod referrer to Google Maps API key in GCP — `https://*.chefflow-derek.workers.dev/*` + any custom domain — otherwise Places autocomplete will silently fail on the live site.

## Refactors pending

_(none)_

## Bug states

_(none)_
