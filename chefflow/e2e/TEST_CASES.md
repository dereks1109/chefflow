# ChefFlow E2E Test Cases

## Conventions

### Clerk bypass
All specs run with `VITE_E2E_MODE=true` (set in `playwright.config.ts` `webServer.env`). In E2E mode, `main.tsx` skips `ClerkProvider` and `App.tsx` renders routes directly via `<UngatedApp>`. No live Clerk account or network call is required.

### LLM mocking
`page.addInitScript()` installs a minimal `window.Clerk` stub so `proxyClient.ts` can retrieve a fake JWT (`fake-e2e-jwt`). `page.route('**/api/llm/generate', ...)` intercepts the proxy endpoint and returns a canned `{ content: string }` payload. The `content` string is the JSON wrapped in ` ```json ``` ` fences to exercise `stripMarkdownFences`. No Groq API key is needed.

### IndexedDB seeding
Each spec's `beforeEach` runs `resetAppState(page)` which:
1. Clears all Dexie stores via the raw IDB API (avoids schema-version conflicts when Dexie holds the connection)
2. Removes seed-flag keys from `localStorage` so demo data re-seeds on the next page load
3. Removes the review-draft key from `sessionStorage`

Test-specific seed data (e.g. a "Ribeye" recipe, a KitchenEvent with two dishes) is inserted via `page.evaluate(() => indexedDB.open('chefflow') ...)` **after** the page has loaded, so Dexie is already at schema version 3.

### data-testid locations
All `data-testid` attributes live in the component files under `chefflow/src/` — colocated with the component, not in a separate mapping file. When a new testid is added for E2E purposes the component file is the canonical location.

---

## `event-review-step.spec.ts` — GenerateEventSheet: Review step state machine

**User story**: As a chef, after the LLM extracts an event from my text, I review each dish to confirm or change how it's resolved before creating the event.

| Test name | Intent |
|---|---|
| both dish rows render with unresolved (red-border) state on entry | Baseline: review step shows all dishes as needing attention; "Create event" disabled |
| auto-match: a dish whose title exists in the recipe library gets linked automatically | Library-match: a recipe seeded with the exact dish name is auto-linked; other dish remains unresolved |
| "The dish is ready to go" clears red border and persists the choice | Ready action: marking one dish ready clears its border; other dish is unaffected |
| "Create event" enables only once all dishes have a resolution | Enablement gate: button only enables when every dish is linked or marked ready |
| "Create event" navigates to the event editor after all dishes resolved | Happy path: clicking "Create event" saves and navigates to `/events/:id/edit` |
| "The dish is ready to go" choice is cleared when Search picker is opened for that dish | Choice conflict: opening search picker for a "ready" dish reverts its choice |

**Mocks / fixtures**: LLM mock (2-dish canned event), Clerk stub, IDB seed (Beef Bourguignon recipe for auto-match test)

---

## `recipe-new.spec.ts` — GenerateRecipeSheet: New recipe flows

**User story**: As a chef, I can create a new recipe from the Recipes library using three input modes — blank, describe (LLM), or photo.

| Test name | Intent |
|---|---|
| Manual tab: "Create blank" emits a blank recipe and navigates to `/recipes/<id>/edit` with title "Untitled recipe" | Manual happy path: correct default tab, blank recipe emitted, correct navigation and title value |
| Describe tab: LLM generate lands on `/recipes/<id>/edit` with "Beef Bourguignon" prefilled | LLM describe path: intercept returns canned recipe, title is hydrated into the editor |
| Photo tab: tab is selectable and shows the file input + Generate button | Photo surface presence: tab is selectable, file input and generate button are in DOM |

**Mocks / fixtures**: LLM mock (Beef Bourguignon canned LlmRecipe), Clerk stub

**Known limitation**: The photo tab end-to-end upload flow (file → downscale → vision LLM → recipe editor) is NOT covered. See "Open coverage gaps" below.

---

## `event-new-mixed-dishes.spec.ts` — GenerateEventSheet: Mixed-dish happy path

**User story**: As a chef generating a new event from text, the Review step correctly handles a mix of auto-matched dishes, Create-new stubs, and ready-to-go dishes before creating the event.

| Test name | Intent |
|---|---|
| Review step renders: Ribeye auto-linked, Lemon tart + Cheese plate show unresolved three-button choice | Validates all three resolution states appear simultaneously on first render |
| "Create new recipe" on Lemon tart → confirm → saves stub and navigates to recipe editor | Create-new path: confirm dialog triggers navigation to `/recipes/<new-id>/edit`; stub is pre-titled with dish name |
| "The dish is ready to go" clears red border; "Create event" enables once all resolved | Enablement gate with mixed resolutions: only after all three dishes are resolved does the button enable |
| all-resolved: "Create event" → `/events/:id/edit` — all three dishes in timeline | Full flow: all three dishes (auto-matched + two ready) appear in event editor after creation |

**Mocks / fixtures**: LLM mock (3-dish canned event), Clerk stub, IDB seed (Ribeye recipe for auto-match)

**Known limitation**: The full "Create new recipe → recipe editor → return to review" detour (sessionStorage resume path) is not tested end-to-end due to a timing dependency in EventsLibrary (listRecipes must resolve before GenerateEventSheet mounts with initialReview). This specific path is covered structurally by the EventsLibrary code but lacks an E2E test.

---

## `event-view-inline-edit.spec.ts` — EventView: Inline dish field editing

**User story**: As a chef on the EventView page, I can inline-edit dish name, portions, and notes without navigating away, and I can edit event metadata via the EventDetailsSheet.

| Test name | Intent |
|---|---|
| a. EventDetailsSheet: edit title + budget → Save → EventView updates without navigating away | Details sheet saves correctly, no navigation side-effect, updated values visible |
| b. Inline name edit: click dish name → type → Enter → row re-renders → persists on reload | Name field: edit mode opens on click, commits on Enter, survives a page reload |
| c. Inline portions edit: click portions → number input → change → Enter → re-renders + persists | Portions field: number input opens, commits on Enter, value persists in IDB |
| d. Inline notes edit: click notes → textarea → change → Enter → persists | Notes field: textarea opens, Enter commits (not Shift+Enter), persists in IDB |
| e. Trash icon: confirm → dish disappears from timeline | Delete: confirm dialog accepted, dish removed from DOM, remaining dish still visible |

**Mocks / fixtures**: No LLM mock needed. IDB seeded directly with a KitchenEvent containing 2 dishes (stable ids `dish_test_01`, `dish_test_02`).

---

## Open coverage gaps

The following paths are NOT covered by the current E2E suite:

1. **Photo-upload recipe generation** (`recipe-new.spec.ts` Photo tab): full `setInputFiles → downscale → vision LLM mock → editor` path. Needs a fixture image + `/api/llm/photo` mock.
2. **Resume-from-recipe-editor (sessionStorage draft)**: the "Create new recipe → fill stub → return to review" detour in `GenerateEventSheet`. The resume hydration works but is subject to a mount-timing race that makes it awkward to assert in one test.
3. **Workflow page interactions**: `WorkflowCta`, workflow generation LLM call, step editing, drag-to-reorder steps. Entirely uncovered.
4. **Drag-and-drop section management** in the EventEditor: reordering dishes within / between sections. Requires `@hello-pangea/dnd` Playwright drag simulation.
5. **Sign-in / sign-out flow**: Clerk-based authentication (only bypassed in E2E mode). A separate auth spec would need a test Clerk environment or a fixture for a real login.
6. **Menu suitability analysis** (MenuCheckPanel): the LLM-powered analysis button and verdict display.
7. **Recipe analysis** (RecipeEditor → "Analyse with AI"): the analysis LLM call and allergen/calorie display.
8. **Firebase / offline sync** (if ever added): no coverage of network-split or conflict-resolution scenarios.
