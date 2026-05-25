# ChefFlow — E2E QA Test Coverage Plan

## Status
Draft — pre-implementation. No E2E tests exist yet; 274 Vitest unit/component tests passing.

---

## 1. Critical User Flows and Representative Assertions

### Flow 1: Authentication (Clerk)

**Approach:** Use a Playwright route mock rather than a live Clerk account in CI.
Mount the app with `VITE_CLERK_PUBLISHABLE_KEY` absent or stubbed; intercept
`/api/auth/*` via `page.route()` to return a synthetic session token.

| # | Test | Assertions |
|---|------|------------|
| 1.1 | Signed-out user sees sign-in screen | `getByTestId('clerk-signin')` visible; no nav links |
| 1.2 | Sign-in renders the correct heading | `getByRole('heading', { name: /sign in/i })` |
| 1.3 | Signed-in user sees main nav | `/recipes` and `/events` links visible |
| 1.4 | Missing `VITE_CLERK_PUBLISHABLE_KEY` shows error banner | Error banner with text about missing key is visible |

**Note:** `clerkMock.tsx` is Vitest-only (imports `vi`). For Playwright, use
`page.route('**/clerk.accounts.dev/**', ...)` or set `VITE_CLERK_PUBLISHABLE_KEY`
to a test-env publishable key and authenticate once via `storageState`.

---

### Flow 2: Recipe Creation via `GenerateRecipeSheet`

| # | Test | Assertions |
|---|------|------------|
| 2.1 | Manual tab — "Create blank" emits untitled recipe and navigates to editor | URL matches `/recipes/:id/edit`; page title `Untitled recipe` visible |
| 2.2 | Describe tab — submitting empty textarea shows inline validation error | `role="status"` error: "Describe what you want first" |
| 2.3 | Describe tab — no API key prompts key sheet | `LlmSettingsSheet` dialog visible; original sheet still open |
| 2.4 | Describe tab — intercept `/api/llm/*` returning valid JSON; recipe lands | RecipeEditor loads with generated title from mock payload |
| 2.5 | Escape key closes sheet without navigation | Sheet unmounts; URL unchanged |

**Selector notes:**
- Tab buttons: `getByRole('tab', { name: /manual/i })`, `/describe/i`
- Submit button: `getByRole('button', { name: /create blank|generate/i })`
- Error container: `getByRole('status')`

---

### Flow 3: New-Event Flow via `GenerateEventSheet` (incl. Review Step)

| # | Test | Assertions |
|---|------|------------|
| 3.1 | Manual tab — "Create blank" creates an untitled event and navigates to editor | URL matches `/events/:id/edit` |
| 3.2 | Describe tab — LLM returns 2 dishes; Review step renders both with red border (unresolved) | Both dish names visible; "Create event" button disabled |
| 3.3 | Review step — mark one dish "Ready to go"; border clears | Dish row no longer has red border class |
| 3.4 | Review step — Search picker filters recipe list | Intercept recipe DB; picker filters by typed query |
| 3.5 | Review step — all dishes resolved; "Create event" enabled and navigates | URL matches `/events/:id/edit` after confirm |
| 3.6 | "Create new recipe" — saves stub, redirects to recipe editor, on return resumes review | `sessionStorage` draft present; sheet reopens in review with stub linked |

**Intercept:** `page.route('**/api/llm/event*', ...)` returning a minimal
`KitchenEvent` JSON with 2 dishes. This keeps the test deterministic and offline.

---

### Flow 4: Event Editor — Sections, Drag-and-Drop, and Metadata

| # | Test | Assertions |
|---|------|------------|
| 4.1 | Load event with one dish; title field pre-populated | `getByLabel('Event title')` value equals event title |
| 4.2 | Add section — new section appears with editable name | `getByLabel('Section name')` visible; default value "Section 1" |
| 4.3 | Rename section — input mutation reflected | Section name input shows typed value |
| 4.4 | Add dish to section — dish appears inside correct section | Dish name visible under correct section heading |
| 4.5 | Drag dish from Unassigned to section — dish moves | `@hello-pangea/dnd` keyboard API: space → arrow → space; dish absent from source, present in dest |
| 4.6 | Save persists changes; navigates to EventView | URL matches `/events/:id`; Dexie write confirmed via intercepted IDB |
| 4.7 | Budget field — entering a value shows it on EventView after save | Budget amount visible on event detail page |
| 4.8 | Contact fields — email/phone saved and rendered on EventView | Email and phone rendered in contact section |

**DnD testing:** `@hello-pangea/dnd` supports keyboard-driven drag in Playwright.
Sequence: `focus(dragHandle)` → `keyboard.press('Space')` → `keyboard.press('ArrowDown')` → `keyboard.press('Space')`.
No mouse-based drag simulation needed; keyboard mode is deterministic.

**Selector gaps requiring `data-testid`:**
- Drag handles (`GripVertical` span) — add `data-testid="drag-handle-{dish.id}"`
- Section name inputs — add `data-testid="section-name-{section.id}"`
- Section container root — add `data-testid="section-{section.id}"`
- Unassigned drop zone — add `data-testid="section-unassigned"`

---

### Flow 5: Workflow Generation, Save, and Return-to-Event Linkage

| # | Test | Assertions |
|---|------|------------|
| 5.1 | EventView with no saved workflow — "Generate Workflow" CTA visible | Link with text "Generate Workflow" present |
| 5.2 | Navigate to `/workflows/:id`; LLM intercept returns valid steps; milestones render | Phase headings (Prep, Cook, Serve) visible |
| 5.3 | Save workflow — confirm dialog → EventView shows "View workflow" + step count | CTA text changes to "View workflow"; step count badge visible |
| 5.4 | Re-enter workflow from "View workflow" — loads saved snapshot (no LLM call) | LLM route interceptor invoked 0 times on second visit |
| 5.5 | Regenerate with dirty reorder — confirm discards and reruns LLM | Old step text gone; new LLM steps appear |

**Intercept:** `page.route('**/api/llm/workflow*', ...)` or the Groq endpoint
(`api.groq.com/openai/v1/chat/completions`) returning the `VALID_DEMO_REPLY`
fixture already defined in `Workflow.test.tsx`.

---

### Flow 6: Menu Suitability with Budget Warning (`MenuCheckPanel`)

| # | Test | Assertions |
|---|------|------------|
| 6.1 | No notes → prompt text "Add guest dietary requirements" visible | Hint paragraph present; Analyse button present |
| 6.2 | Has notes → "Not analysed yet" message visible | Status text present |
| 6.3 | Intercept LLM returning `verdict: "warnings"` — amber banner renders | Banner with class containing `amber` visible |
| 6.4 | Intercept LLM returning `verdict: "blocked"` — red banner + blocker issue | Red ShieldAlert icon row visible |
| 6.5 | Budget over total: verify budget warning message appears on EventView | EventView renders budget vs total comparison |

---

### Flow 7: Google Places Autocomplete (`LocationAutocomplete`)

**CI strategy:** Skip or mark as `test.skip` unless `VITE_GOOGLE_MAPS_API_KEY` is set.
For offline runs, stub `window.google.maps.places.AutocompleteSuggestion` via
`page.evaluate()` before each test.

| # | Test | Assertions |
|---|------|------------|
| 7.1 | No API key — "Suggestions disabled" hint visible below input | Warning text visible |
| 7.2 | Stub Places API; type 3+ chars — dropdown listbox appears | `role="listbox"` visible |
| 7.3 | Click a suggestion — input value updates; dropdown closes | Input value equals prediction description |
| 7.4 | Click outside dropdown — dropdown closes | `role="listbox"` absent |

---

## 2. Infrastructure Decisions

### Framework: Playwright (TypeScript)

Playwright is the right choice for ChefFlow:

- **Vite + Cloudflare Workers** — Playwright's `webServer` config starts `vite dev` and waits for the port; no coupling to the Worker runtime needed for UI tests.
- **IndexedDB / Dexie seeding** — Playwright exposes `page.evaluate()` for direct IDB writes and reads, which Cypress can do but is more awkward.
- **Route interception** — `page.route()` is low-friction for stubbing Groq and Google Maps without a proxy server.
- **TypeScript first-class** — matches the codebase.
- **Trace / video on failure** — built-in; essential given the LLM flows.

### Test Location: `chefflow/e2e/`

Place E2E tests at `chefflow/e2e/` (not `tests/playwright/`) for two reasons:

1. Vitest glob patterns in `vite.config.ts` typically include `src/**/*.test.*`. A top-level `e2e/` directory stays outside that glob and requires zero Vitest config changes.
2. Co-location with `chefflow/src/` makes it obvious these tests belong to this package. A `tests/playwright/` subdirectory would require explaining why `tests/` isn't `e2e/` to every new contributor.

Structure:
```
chefflow/
  e2e/
    fixtures/         # Playwright fixtures: seedEvent, seedRecipe, authState
    pages/            # Page Object Models
    flows/
      auth.spec.ts
      recipe-creation.spec.ts
      event-creation.spec.ts
      event-editor.spec.ts
      workflow.spec.ts
      menu-check.spec.ts
      location-autocomplete.spec.ts
  playwright.config.ts
```

### Mocking Strategy

**Clerk:**
- In proxy mode (`VITE_LLM_MODE=proxy`), Clerk JWTs gate the Worker. For E2E, use `test.use({ storageState: 'e2e/fixtures/auth.json' })` after a one-time setup that authenticates against Clerk's test environment. The `auth.json` is generated by a `globalSetup` script and committed to the repo (it contains no secrets — only the session cookie/token).
- Alternatively, use Playwright `page.route('**/clerk.accounts.dev/**', ...)` to short-circuit the Clerk SDK's token fetch and inject a fake `useAuth` state via `window.__clerk_mock = ...` set in `page.addInitScript()`.

**Groq (LLM):**
- Intercept at the network level: `page.route('**/api/groq**', ...)` or `page.route('**/api.groq.com/**', ...)` returning fixture JSON.
- Use the same `VALID_DEMO_REPLY` fixture already in `Workflow.test.tsx` — extract it to `e2e/fixtures/groqReplies.ts` so both Vitest and Playwright share the data.

**Google Maps:**
- Inject a mock via `page.addInitScript()` that sets `window.google.maps.places.AutocompleteSuggestion` to a stub returning hardcoded predictions. This avoids network calls entirely and is deterministic.
- Mark Google Maps tests `test.skip` when `VITE_GOOGLE_MAPS_API_KEY` is unset in CI (use `test.skip(!process.env.VITE_GOOGLE_MAPS_API_KEY, 'no Maps key in CI')`).

**Dexie / IndexedDB:**
- Reset between tests via `page.evaluate(() => indexedDB.deleteDatabase('chefflow'))` in `beforeEach`. The app recreates the DB on next access.
- For seed data, use `page.evaluate(({ event }) => { /* put via Dexie */ }, { event: seedEvent })` or expose a `window.__seed` helper in a dev-only entry point.

### CI: GitHub Actions

```yaml
# Trigger on PRs to main; run before merge (blocking).
on:
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --project=chromium
        env:
          VITE_LLM_MODE: proxy        # use stubbed proxy mode; no real Groq key
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_TEST_PK }}
```

Run **blocking** on PRs. The suite must pass before merge. Add a separate
`playwright test --project=firefox` non-blocking job for cross-browser regression.
Do not run the full Playwright suite on every push to feature branches — only on PR to `main`.

---

## 3. Selector Strategy — `data-testid` Gaps

Most form fields in EventEditor and EventView use `aria-label`, which Playwright resolves with `getByLabel()`. The following elements lack stable selectors and need `data-testid` attributes added before E2E tests can target them reliably:

| Component | Element | Required attribute |
|-----------|---------|-------------------|
| `EventEditor` / `DraggableDish` | Drag handle `<span>` | `data-testid="drag-handle-{dish.id}"` |
| `EventEditor` / `SectionContainer` | Section root `<section>` | `data-testid="section-{droppableId}"` |
| `EventEditor` / `SectionContainer` | Section name `<input>` | `data-testid="section-name-{droppableId}"` |
| `EventEditor` / `SectionContainer` | Remove section `<button>` | `data-testid="remove-section-{droppableId}"` |
| `GenerateEventSheet` | Review step dish row `<li>` | `data-testid="review-dish-{dish.id}"` |
| `GenerateEventSheet` | "Ready to go" button per dish | `data-testid="ready-{dish.id}"` |
| `GenerateEventSheet` | "Search recipes" toggle per dish | `data-testid="search-{dish.id}"` |
| `MenuCheckPanel` | Verdict banner | `data-testid="menu-verdict"` |
| `WorkflowCta` (in EventView) | "View workflow" / "Generate Workflow" link | `data-testid="workflow-cta"` |
| `Workflow` | Save button | already accessible via `getByRole('button', { name: /save/i })` — no change needed |

ARIA labels are already present on all standard form inputs (title, date, location, contact, budget). No changes needed there.

---

## 4. Top-5 Highest-Value E2E Tests to Write First

Ranked by risk × missing coverage:

1. **Event creation via Describe tab — full LLM → Review → finalise flow** (Flow 3, tests 3.2–3.5)
   The Review step's three-way per-dish choice (matched / ready / create-new) is the most complex stateful UI in the app and has zero component-level coverage. A failing test here would catch regressions in `GenerateEventSheet`'s `status` state machine that unit tests cannot.

2. **Workflow generate → save → EventView "View workflow" CTA linkage** (Flow 5, tests 5.2–5.3)
   The `WorkflowCta` conditional render and the Dexie write of `event.workflow` are tested in isolation but the round-trip (generate → save → navigate back → CTA updates) is not covered anywhere. This is the most user-visible post-MVP feature.

3. **Event editor drag-and-drop: dish moves between sections** (Flow 4, test 4.5)
   `@hello-pangea/dnd`'s keyboard API is the only reliable way to test DnD deterministically. No existing test exercises cross-section moves. A regression here is silent — the UI renders but the Dexie write is wrong.

4. **Recipe creation via Describe tab — LLM intercept → RecipeEditor lands with generated title** (Flow 2, test 2.4)
   The Groq intercept pattern established here is reused by flows 3, 5, and 6. Getting this working first unblocks the rest of the LLM-dependent suite.

5. **MenuCheckPanel — LLM intercept returning `blocked` verdict renders red blocker row** (Flow 6, test 6.4)
   `menuCheck.test.ts` covers the pure LLM output parsing but the component rendering of `blocked` + `blocker`-severity issues has no test. This path represents the highest-stakes UX in the app (a guest cannot eat the planned food).

---

## Coverage Gap Summary

The most significant gap: **no test verifies that the `GenerateEventSheet` Review step correctly wires dish-level choices (matched / ready-to-go / create-new) through to the final `KitchenEvent.dishes` written to Dexie.** The unit tests in `eventsRepo.test.ts` and `eventGen.test.ts` cover persistence and LLM parsing respectively, but the stateful UI layer that mediates between them — `status.matches`, `status.choices`, the `handleFinalise` merge, and the `createAndLinkRecipe` sessionStorage + redirect path — is untested entirely. A regression anywhere in that state machine would silently save events with unlinked dishes or wrong `isPrepared` flags, with no failing test to surface it.
