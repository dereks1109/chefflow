# ChefFlow Plan 2a — Recipe CRUD UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up React Router, Dexie persistence, Zustand unit-system store, and build the recipe library + dual-pane editor pages so a chef can create, edit, view, duplicate, and delete recipes that persist across browser reloads. NO sharing — that's Plan 2b.

**Architecture:** Vite SPA with React Router (BrowserRouter); routes `/recipes` (library) and `/recipes/:id/edit` (editor), plus stubs for `/events` and `/events/:id/cook` so navigation is complete. Dexie wraps IndexedDB. Zustand holds global unit-system preference. The dual-pane editor uses the structured form on the left + `react-markdown` preview on the right, round-tripping through `core/parser/{parseRecipe,serializeRecipe}` from Plan 1.

**Tech Stack:** react-router-dom, zustand, dexie, fake-indexeddb (test only), react-markdown (already installed), Tailwind (already installed). Vitest + React Testing Library.

**Spec reference:** `docs/superpowers/specs/2026-05-13-chefflow-mvp-design.md` Sections 1, 3, plus the `db/` and `state/` modules in Section 8.

---

## UX Decisions Locked Here

- **Navigation pattern:** Bottom nav bar with two tabs: 🍳 Recipes / 📅 Events (Events tab routes to a "Coming soon" placeholder until Plan 3). Mobile-first; the bar is fixed at the bottom on small viewports and inline at the top on `md:` and up.
- **Router:** `BrowserRouter` from react-router-dom v6. Static hosts (Netlify/Vercel/Cloudflare Pages) handle SPA fallback natively; GitHub Pages requires a `404.html` trick we'll handle in Plan 4 when we set up hosting.
- **Theme:** Tailwind defaults with a small custom palette: kitchen-black (true `#000000`) for the dark mode background, near-white text. Light mode = standard slate. CSS variables for accent + danger so we can theme later without touching components.
- **Recipe IDs:** Library recipes use the existing `randomId()` from `parseRecipe.ts` re-exported as a stable utility (or duplicate as a small `core/util/id.ts` so the parser isn't a UI dependency).
- **Empty state:** First-time visitor sees a friendly empty library with a single "Create your first recipe" call-to-action.
- **Auto-save vs Save button:** Explicit Save button in the editor (per Section 3 of the spec). Save persists to Dexie and navigates back to `/recipes` with a brief toast.
- **Unsaved-changes guard:** If the editor has unsaved changes and the user navigates away, show a confirm dialog. (`window.confirm` is fine for MVP.)

---

## File Structure (Plan 2a Creates / Modifies)

```
chefflow/
├── package.json                              # add: react-router-dom, zustand, dexie, fake-indexeddb
├── tailwind.config.ts                        # add darkMode + accent palette
├── src/
│   ├── main.tsx                              # MODIFY: wrap App in <BrowserRouter>
│   ├── App.tsx                               # REWRITE: routes, layout
│   ├── index.css                             # NEW: tailwind directives + base styles
│   ├── core/
│   │   └── util/
│   │       ├── id.ts                         # NEW: extracted randomId()
│   │       └── id.test.ts                    # NEW
│   ├── db/
│   │   ├── dexie.ts                          # NEW: Dexie instance + table defs
│   │   ├── recipesRepo.ts                    # NEW: list/get/save/delete CRUD
│   │   └── recipesRepo.test.ts               # NEW (uses fake-indexeddb)
│   ├── state/
│   │   ├── unitSystemStore.ts                # NEW: Zustand
│   │   └── unitSystemStore.test.ts           # NEW
│   ├── ui/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx                 # NEW: bottom nav + outlet
│   │   │   └── BottomNav.tsx                 # NEW
│   │   ├── pages/
│   │   │   ├── RecipesLibrary.tsx            # NEW
│   │   │   ├── RecipeEditor.tsx              # NEW
│   │   │   ├── EventsPlaceholder.tsx         # NEW (stub)
│   │   │   └── KitchenPlaceholder.tsx        # NEW (stub for /events/:id/cook)
│   │   ├── components/
│   │   │   ├── RecipeCard.tsx                # NEW
│   │   │   ├── IngredientRow.tsx             # NEW
│   │   │   ├── StepRow.tsx                   # NEW
│   │   │   ├── MarkdownPreview.tsx           # NEW
│   │   │   ├── UnitSystemToggle.tsx          # NEW
│   │   │   ├── ConfirmDialog.tsx             # NEW
│   │   │   └── Toast.tsx                     # NEW
│   │   └── theme/
│   │       └── tokens.ts                     # NEW: small typed palette helpers
│   └── vitest.setup.ts                       # MODIFY: register fake-indexeddb
└── tsconfig.app.json                         # unchanged
```

Plan 1 file `parseRecipe.ts` is modified only to import the extracted `randomId` (no behavior change).

---

## Task 0: Install Dependencies + Tailwind Globals + Router Shell

**Files:**
- Modify: `chefflow/package.json` (via npm install)
- Modify: `chefflow/tailwind.config.ts`
- Create: `chefflow/src/index.css`
- Modify: `chefflow/src/main.tsx`
- Modify: `chefflow/src/App.tsx`
- Modify: `chefflow/src/vitest.setup.ts`

- [ ] **Step 1: Install runtime deps**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm install react-router-dom zustand dexie
```
Expected: three packages added. Confirm with `cat package.json | grep -E "(react-router|zustand|dexie)"`.

- [ ] **Step 2: Install dev deps**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm install -D fake-indexeddb
```
Expected: dev dep added.

- [ ] **Step 3: Update Tailwind config to enable dark mode + accent palette**

Replace `chefflow/tailwind.config.ts` with:
```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        kitchen: {
          black: '#000000',
          ink: '#0a0a0a',
          slate: '#1f2937',
        },
        accent: {
          DEFAULT: '#f97316',  // orange-500 — high-contrast call-to-action
          hover: '#ea580c',
        },
        danger: '#dc2626',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4: Create global Tailwind stylesheet**

Create `chefflow/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}

body {
  @apply bg-white text-slate-900 font-sans antialiased;
}

html.dark body {
  @apply bg-kitchen-black text-slate-100;
}

/* Touch-target helper */
.touch-target {
  @apply min-h-touch min-w-touch flex items-center;
}

/* Form input baseline */
.input {
  @apply w-full rounded-md border border-slate-300 px-3 py-2 bg-white text-slate-900
         focus:outline-none focus:ring-2 focus:ring-accent
         dark:bg-kitchen-ink dark:border-slate-700 dark:text-slate-100;
}

.btn {
  @apply touch-target rounded-md px-4 font-medium text-center justify-center
         transition-colors focus:outline-none focus:ring-2 focus:ring-accent;
}

.btn-primary {
  @apply btn bg-accent text-white hover:bg-accent-hover;
}

.btn-secondary {
  @apply btn bg-slate-100 text-slate-900 hover:bg-slate-200
         dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700;
}

.btn-danger {
  @apply btn bg-danger text-white hover:opacity-90;
}
```

- [ ] **Step 5: Update `main.tsx` to import the new stylesheet + wrap in BrowserRouter**

Replace `chefflow/src/main.tsx` with:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 6: Replace `App.tsx` with route shell**

Replace `chefflow/src/App.tsx` with a minimal placeholder that will be expanded in Task 4:
```tsx
import { Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Navigate to="/recipes" replace />} />
        <Route path="*" element={<PlaceholderShell />} />
      </Routes>
    </div>
  );
}

function PlaceholderShell() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">ChefFlow</h1>
      <p className="text-slate-600 dark:text-slate-400">Booting up…</p>
    </main>
  );
}
```
(This intentionally minimal — Task 4 will replace `PlaceholderShell` with the real layout.)

- [ ] **Step 7: Update `vitest.setup.ts` to wire fake-indexeddb**

Replace `chefflow/src/vitest.setup.ts` with:
```ts
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
```

- [ ] **Step 8: Verify it all compiles and serves**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npx tsc --noEmit && echo "TS OK" && ( timeout 10 npm run dev 2>&1 || true ) | grep -iE "(vite|ready|error)"
```
Expected: `TS OK` followed by a line like `VITE v… ready in X ms`.

- [ ] **Step 9: Verify tests still pass**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run
```
Expected: 55 passing (no regression from Plan 1).

- [ ] **Step 10: Commit**

From workspace root:
```bash
cd "/Users/derekshek/vs code" && git add chefflow/
git commit -m "chore(ui): install router/zustand/dexie + Tailwind globals + router shell"
```

---

## Task 1: Extract `randomId` Utility

**Files:**
- Create: `chefflow/src/core/util/id.ts`
- Create: `chefflow/src/core/util/id.test.ts`
- Modify: `chefflow/src/core/parser/parseRecipe.ts`

This decouples ID generation from the parser so `db/recipesRepo` can use it without depending on the parser module.

- [ ] **Step 1: Write a failing test**

Create `chefflow/src/core/util/id.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { randomId } from './id';

describe('randomId', () => {
  it('returns a string of length 10 starting with r_', () => {
    const id = randomId();
    expect(id).toMatch(/^r_[a-z0-9]{8}$/);
  });
  it('produces different ids on consecutive calls', () => {
    const a = randomId();
    const b = randomId();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/core/util/id.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `id.ts`**

Create `chefflow/src/core/util/id.ts`:
```ts
export function randomId(): string {
  return 'r_' + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}
```

- [ ] **Step 4: Run — expect tests pass**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/core/util/id.test.ts
```
Expected: 2 passing.

- [ ] **Step 5: Update `parseRecipe.ts` to import `randomId`**

Find the local `function randomId()` definition in `chefflow/src/core/parser/parseRecipe.ts` and delete it. At the top of the file, add:
```ts
import { randomId } from '../util/id';
```
The single call site to `randomId()` remains unchanged.

- [ ] **Step 6: Run full test suite**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run
```
Expected: 57 passing (55 prior + 2 new).

- [ ] **Step 7: Commit**

```bash
cd "/Users/derekshek/vs code" && git add chefflow/src/core/util/ chefflow/src/core/parser/parseRecipe.ts
git commit -m "refactor(core/util): extract randomId from parser"
```

---

## Task 2: Dexie + Recipes Repo (TDD)

**Files:**
- Create: `chefflow/src/db/dexie.ts`
- Create: `chefflow/src/db/recipesRepo.ts`
- Create: `chefflow/src/db/recipesRepo.test.ts`

The repo exposes async CRUD over Dexie. Tests run against `fake-indexeddb` (already wired in `vitest.setup.ts`).

- [ ] **Step 1: Write failing tests**

Create `chefflow/src/db/recipesRepo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './dexie';
import { listRecipes, getRecipe, saveRecipe, deleteRecipe } from './recipesRepo';
import type { Recipe } from '../core/types';

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r_test_001',
    title: 'Test Recipe',
    originalYield: 4,
    ingredients: [],
    steps: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.recipes.clear();
});

describe('recipesRepo', () => {
  it('saves and retrieves a recipe', async () => {
    const r = makeRecipe();
    await saveRecipe(r);
    const got = await getRecipe('r_test_001');
    expect(got?.title).toBe('Test Recipe');
  });

  it('returns undefined for unknown id', async () => {
    expect(await getRecipe('nope')).toBeUndefined();
  });

  it('listRecipes returns all saved recipes sorted by updatedAt desc', async () => {
    await saveRecipe(makeRecipe({ id: 'a', title: 'A', updatedAt: 100 }));
    await saveRecipe(makeRecipe({ id: 'b', title: 'B', updatedAt: 300 }));
    await saveRecipe(makeRecipe({ id: 'c', title: 'C', updatedAt: 200 }));
    const all = await listRecipes();
    expect(all.map(r => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('saveRecipe updates an existing record', async () => {
    await saveRecipe(makeRecipe({ title: 'V1' }));
    await saveRecipe(makeRecipe({ title: 'V2' }));
    const all = await listRecipes();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('V2');
  });

  it('deleteRecipe removes the record', async () => {
    await saveRecipe(makeRecipe());
    await deleteRecipe('r_test_001');
    expect(await getRecipe('r_test_001')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/db/recipesRepo.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the Dexie instance**

Create `chefflow/src/db/dexie.ts`:
```ts
import Dexie, { type Table } from 'dexie';
import type { Recipe } from '../core/types';

class ChefFlowDB extends Dexie {
  recipes!: Table<Recipe, string>;

  constructor() {
    super('chefflow');
    this.version(1).stores({
      // Primary key on id; index updatedAt for sorted list queries.
      recipes: 'id, updatedAt, title',
    });
  }
}

export const db = new ChefFlowDB();
```

- [ ] **Step 4: Implement the repo**

Create `chefflow/src/db/recipesRepo.ts`:
```ts
import { db } from './dexie';
import type { Recipe } from '../core/types';

export async function listRecipes(): Promise<Recipe[]> {
  return db.recipes.orderBy('updatedAt').reverse().toArray();
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  return db.recipes.get(id);
}

export async function saveRecipe(recipe: Recipe): Promise<void> {
  await db.recipes.put(recipe);
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id);
}
```

- [ ] **Step 5: Run — expect tests pass**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/db/recipesRepo.test.ts
```
Expected: 5 passing.

- [ ] **Step 6: Full suite**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run
```
Expected: 62 passing.

- [ ] **Step 7: Commit**

```bash
cd "/Users/derekshek/vs code" && git add chefflow/src/db/
git commit -m "feat(db): Dexie instance + recipes CRUD repo"
```

---

## Task 3: Unit System Store (TDD)

**Files:**
- Create: `chefflow/src/state/unitSystemStore.ts`
- Create: `chefflow/src/state/unitSystemStore.test.ts`

A small Zustand store holding the global `metric | imperial | auto` preference. Persists to localStorage so the chef's choice survives reloads.

- [ ] **Step 1: Write failing tests**

Create `chefflow/src/state/unitSystemStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useUnitSystemStore } from './unitSystemStore';

beforeEach(() => {
  window.localStorage.clear();
  // Reset zustand store between tests
  useUnitSystemStore.setState({ system: 'auto' });
});

describe('unitSystemStore', () => {
  it('defaults to auto', () => {
    expect(useUnitSystemStore.getState().system).toBe('auto');
  });
  it('setSystem updates the value', () => {
    useUnitSystemStore.getState().setSystem('metric');
    expect(useUnitSystemStore.getState().system).toBe('metric');
  });
  it('persists across store re-reads via localStorage', () => {
    useUnitSystemStore.getState().setSystem('imperial');
    // Simulating reload: the localStorage value should be there.
    const raw = window.localStorage.getItem('chefflow:unit-system');
    expect(raw).toContain('imperial');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/state/unitSystemStore.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

Create `chefflow/src/state/unitSystemStore.ts`:
```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UnitSystem } from '../core/types';

interface UnitSystemState {
  system: UnitSystem;
  setSystem: (s: UnitSystem) => void;
}

export const useUnitSystemStore = create<UnitSystemState>()(
  persist(
    (set) => ({
      system: 'auto',
      setSystem: (system) => set({ system }),
    }),
    {
      name: 'chefflow:unit-system',
    }
  )
);
```

- [ ] **Step 4: Run — expect tests pass**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/state/unitSystemStore.test.ts
```
Expected: 3 passing.

- [ ] **Step 5: Full suite**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run
```
Expected: 65 passing.

- [ ] **Step 6: Commit**

```bash
cd "/Users/derekshek/vs code" && git add chefflow/src/state/
git commit -m "feat(state): unit-system Zustand store with localStorage persistence"
```

---

## Task 4: App Layout + Bottom Nav + Placeholder Routes

**Files:**
- Create: `chefflow/src/ui/layout/AppLayout.tsx`
- Create: `chefflow/src/ui/layout/BottomNav.tsx`
- Create: `chefflow/src/ui/pages/EventsPlaceholder.tsx`
- Create: `chefflow/src/ui/pages/KitchenPlaceholder.tsx`
- Modify: `chefflow/src/App.tsx`

- [ ] **Step 1: Create the Events placeholder page**

Create `chefflow/src/ui/pages/EventsPlaceholder.tsx`:
```tsx
export default function EventsPlaceholder() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Events</h1>
      <p className="mt-4 text-slate-600 dark:text-slate-400">
        Event planning is coming soon. For now, create and edit your recipes in the Recipes tab.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create the Kitchen placeholder page**

Create `chefflow/src/ui/pages/KitchenPlaceholder.tsx`:
```tsx
export default function KitchenPlaceholder() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Kitchen Mode</h1>
      <p className="mt-4 text-slate-600 dark:text-slate-400">
        Kitchen mode renders the merged scrollable workflow for an event. Available in a later release.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create `BottomNav`**

Create `chefflow/src/ui/layout/BottomNav.tsx`:
```tsx
import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/recipes', label: 'Recipes', icon: '🍳' },
  { to: '/events', label: 'Events', icon: '📅' },
];

export default function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-10 border-t border-slate-200 bg-white
                 dark:border-slate-800 dark:bg-kitchen-ink
                 md:static md:border-t-0 md:border-b md:flex md:gap-2 md:px-4"
    >
      <ul className="flex md:gap-2">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1 md:flex-none">
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                [
                  'touch-target px-4 py-2 flex flex-col items-center justify-center text-sm',
                  'md:flex-row md:gap-2 md:py-3',
                  isActive
                    ? 'text-accent font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100',
                ].join(' ')
              }
            >
              <span aria-hidden="true" className="text-xl md:text-base">{t.icon}</span>
              <span>{t.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Create `AppLayout`**

Create `chefflow/src/ui/layout/AppLayout.tsx`:
```tsx
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <BottomNav />
      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
```

Note: `pb-20` on the `<main>` reserves space for the bottom nav on mobile.

- [ ] **Step 5: Wire layout + routes in `App.tsx`**

Replace `chefflow/src/App.tsx` with:
```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './ui/layout/AppLayout';
import EventsPlaceholder from './ui/pages/EventsPlaceholder';
import KitchenPlaceholder from './ui/pages/KitchenPlaceholder';

// These two will be implemented in Tasks 5 and 6.
function RecipesLibraryStub() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Recipes</h1></div>;
}
function RecipeEditorStub() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Edit Recipe</h1></div>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/recipes" replace />} />
        <Route path="/recipes" element={<RecipesLibraryStub />} />
        <Route path="/recipes/:id/edit" element={<RecipeEditorStub />} />
        <Route path="/events" element={<EventsPlaceholder />} />
        <Route path="/events/:id/cook" element={<KitchenPlaceholder />} />
        <Route path="*" element={<div className="p-6">Not found.</div>} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 6: Verify dev server renders the shell**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && ( timeout 10 npm run dev 2>&1 || true ) | grep -iE "(vite|ready|error)"
```
Expected: `VITE v… ready in X ms`. (Manual browser check optional; the next task will add smoke tests with React Testing Library.)

- [ ] **Step 7: Commit**

```bash
cd "/Users/derekshek/vs code" && git add chefflow/src/
git commit -m "feat(ui): app layout + bottom nav + placeholder routes"
```

---

## Task 5: Recipes Library Page

**Files:**
- Create: `chefflow/src/ui/components/RecipeCard.tsx`
- Create: `chefflow/src/ui/pages/RecipesLibrary.tsx`
- Create: `chefflow/src/ui/pages/RecipesLibrary.test.tsx`
- Modify: `chefflow/src/App.tsx` (swap stub for real page)

The library shows all saved recipes as cards. Empty state shows a friendly "Create your first recipe" CTA. Each card has a menu: Edit / Duplicate / Delete (Export and Share land in Plan 2b).

- [ ] **Step 1: Create `RecipeCard`**

Create `chefflow/src/ui/components/RecipeCard.tsx`:
```tsx
import { Link } from 'react-router-dom';
import type { Recipe } from '../../core/types';

interface Props {
  recipe: Recipe;
  onDuplicate: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
}

export default function RecipeCard({ recipe, onDuplicate, onDelete }: Props) {
  return (
    <article className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-kitchen-ink">
      <header className="flex items-start justify-between gap-2">
        <Link to={`/recipes/${recipe.id}/edit`} className="text-lg font-semibold hover:text-accent">
          {recipe.title || 'Untitled recipe'}
        </Link>
      </header>
      <dl className="mt-2 text-sm text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
        <div>
          <dt className="sr-only">Yield</dt>
          <dd>{recipe.originalYield} portion{recipe.originalYield === 1 ? '' : 's'}</dd>
        </div>
        {recipe.prepTime && (
          <div>
            <dt className="sr-only">Prep</dt>
            <dd>Prep {recipe.prepTime}</dd>
          </div>
        )}
        {recipe.cookTime && (
          <div>
            <dt className="sr-only">Cook</dt>
            <dd>Cook {recipe.cookTime}</dd>
          </div>
        )}
      </dl>
      <footer className="mt-3 flex gap-2">
        <Link to={`/recipes/${recipe.id}/edit`} className="btn-secondary text-sm">Edit</Link>
        <button type="button" onClick={() => onDuplicate(recipe)} className="btn-secondary text-sm">
          Duplicate
        </button>
        <button type="button" onClick={() => onDelete(recipe)} className="btn-danger text-sm">
          Delete
        </button>
      </footer>
    </article>
  );
}
```

- [ ] **Step 2: Write a failing component test for empty state**

Create `chefflow/src/ui/pages/RecipesLibrary.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RecipesLibrary from './RecipesLibrary';
import { db } from '../../db/dexie';
import type { Recipe } from '../../core/types';

beforeEach(async () => {
  await db.recipes.clear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <RecipesLibrary />
    </MemoryRouter>
  );
}

const stew: Recipe = {
  id: 'r_test_001',
  title: 'Beef Stew',
  originalYield: 4,
  ingredients: [],
  steps: [],
  createdAt: 1,
  updatedAt: 1,
};

describe('RecipesLibrary', () => {
  it('shows empty state when no recipes exist', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /create your first recipe/i })).toBeInTheDocument();
  });

  it('lists saved recipes', async () => {
    await db.recipes.put(stew);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Beef Stew' })).toBeInTheDocument();
    });
  });

  it('duplicates a recipe with a new id', async () => {
    await db.recipes.put(stew);
    renderPage();
    await waitFor(() => screen.getByText('Beef Stew'));
    await userEvent.click(screen.getByRole('button', { name: /duplicate/i }));
    await waitFor(async () => {
      const all = await db.recipes.toArray();
      expect(all).toHaveLength(2);
      const dup = all.find((r) => r.id !== 'r_test_001')!;
      expect(dup.title).toBe('Beef Stew (copy)');
    });
  });

  it('deletes a recipe after confirm', async () => {
    await db.recipes.put(stew);
    // Auto-accept confirm for this test
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      renderPage();
      await waitFor(() => screen.getByText('Beef Stew'));
      await userEvent.click(screen.getByRole('button', { name: /delete/i }));
      await waitFor(async () => {
        expect(await db.recipes.count()).toBe(0);
      });
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
```

- [ ] **Step 3: Run — expect failure**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/ui/pages/RecipesLibrary.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `RecipesLibrary`**

Create `chefflow/src/ui/pages/RecipesLibrary.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RecipeCard from '../components/RecipeCard';
import { listRecipes, saveRecipe, deleteRecipe } from '../../db/recipesRepo';
import { randomId } from '../../core/util/id';
import type { Recipe } from '../../core/types';

export default function RecipesLibrary() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listRecipes().then(setRecipes);
  }, []);

  async function handleDuplicate(source: Recipe) {
    const copy: Recipe = {
      ...source,
      id: randomId(),
      title: `${source.title} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveRecipe(copy);
    setRecipes(await listRecipes());
  }

  async function handleDelete(target: Recipe) {
    if (!window.confirm(`Delete "${target.title}"? This cannot be undone.`)) return;
    await deleteRecipe(target.id);
    setRecipes(await listRecipes());
  }

  async function handleCreateNew() {
    const fresh: Recipe = {
      id: randomId(),
      title: 'Untitled recipe',
      originalYield: 1,
      ingredients: [],
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveRecipe(fresh);
    navigate(`/recipes/${fresh.id}/edit`);
  }

  if (recipes === null) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  if (recipes.length === 0) {
    return (
      <section className="p-6 text-center">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <p className="mt-4 text-slate-600 dark:text-slate-400">No recipes yet.</p>
        <Link
          to="#"
          onClick={(e) => {
            e.preventDefault();
            void handleCreateNew();
          }}
          className="btn-primary mt-6 inline-flex"
        >
          Create your first recipe
        </Link>
      </section>
    );
  }

  return (
    <section className="p-4 md:p-6">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <button type="button" onClick={() => void handleCreateNew()} className="btn-primary">
          New recipe
        </button>
      </header>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {recipes.map((r) => (
          <li key={r.id}>
            <RecipeCard recipe={r} onDuplicate={handleDuplicate} onDelete={handleDelete} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Wire the real page into the router**

In `chefflow/src/App.tsx`, replace the `RecipesLibraryStub` import-and-element with the real one. The change is:

Old:
```tsx
function RecipesLibraryStub() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Recipes</h1></div>;
}
// ...
<Route path="/recipes" element={<RecipesLibraryStub />} />
```
New:
```tsx
import RecipesLibrary from './ui/pages/RecipesLibrary';
// ...
<Route path="/recipes" element={<RecipesLibrary />} />
```
Remove the now-unused `RecipesLibraryStub` function.

- [ ] **Step 6: Run — expect tests pass**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/ui/pages/RecipesLibrary.test.tsx
```
Expected: 4 passing.

- [ ] **Step 7: Full suite**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run
```
Expected: 69 passing (65 prior + 4 new).

- [ ] **Step 8: Commit**

```bash
cd "/Users/derekshek/vs code" && git add chefflow/src/
git commit -m "feat(ui): recipes library page (list/create/duplicate/delete)"
```

---

## Task 6: Recipe Editor — Header + Ingredients

**Files:**
- Create: `chefflow/src/ui/components/IngredientRow.tsx`
- Create: `chefflow/src/ui/pages/RecipeEditor.tsx`
- Create: `chefflow/src/ui/pages/RecipeEditor.test.tsx`
- Modify: `chefflow/src/App.tsx` (swap stub)

This task handles the title/yield/time fields and the ingredient list. Steps come in Task 7; markdown preview in Task 8.

- [ ] **Step 1: Create `IngredientRow`**

Create `chefflow/src/ui/components/IngredientRow.tsx`:
```tsx
import type { Ingredient } from '../../core/types';
import { randomId } from '../../core/util/id';

interface Props {
  value: Ingredient;
  onChange: (next: Ingredient) => void;
  onRemove: () => void;
}

const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'];
const VOLUME_UNITS = ['ml', 'L', 'tsp', 'tbsp', 'cup', 'fl oz', 'pt', 'qt', 'gal'];

export default function IngredientRow({ value, onChange, onRemove }: Props) {
  function update<K extends keyof Ingredient>(key: K, v: Ingredient[K]) {
    const next = { ...value, [key]: v };
    next.raw = `{${next.amount}|${next.unit}|${next.name}}`;
    onChange(next);
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <input
        type="number"
        step="any"
        value={value.amount}
        onChange={(e) => update('amount', Number(e.target.value))}
        className="input w-24"
        aria-label="Amount"
      />
      <select
        value={value.unit}
        onChange={(e) => update('unit', e.target.value)}
        className="input w-28"
        aria-label="Unit"
      >
        <optgroup label="Weight">
          {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </optgroup>
        <optgroup label="Volume">
          {VOLUME_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </optgroup>
      </select>
      <input
        type="text"
        value={value.name}
        onChange={(e) => update('name', e.target.value)}
        className="input flex-1 min-w-[10rem]"
        aria-label="Ingredient name"
        placeholder="Ingredient"
      />
      <button
        type="button"
        onClick={() => update('isLocked', !value.isLocked)}
        className={`touch-target px-3 rounded-md text-lg ${value.isLocked ? 'bg-accent text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
        aria-label={value.isLocked ? 'Unlock ingredient (will scale)' : 'Lock ingredient (no scaling)'}
        title={value.isLocked ? 'Locked — will not scale' : 'Unlocked — scales with portions'}
      >
        {value.isLocked ? '🔒' : '🔓'}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="touch-target px-3 rounded-md text-lg bg-slate-100 dark:bg-slate-800"
        aria-label="Remove ingredient"
      >
        ✕
      </button>
    </li>
  );
}

export function blankIngredient(): Ingredient {
  return {
    id: randomId(),
    raw: '{0|g|}',
    amount: 0,
    unit: 'g',
    name: '',
    isLocked: false,
  };
}
```

- [ ] **Step 2: Write failing editor tests**

Create `chefflow/src/ui/pages/RecipeEditor.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RecipeEditor from './RecipeEditor';
import { db } from '../../db/dexie';
import type { Recipe } from '../../core/types';

beforeEach(async () => {
  await db.recipes.clear();
});

const seed: Recipe = {
  id: 'r_test_seed',
  title: 'Seed Recipe',
  originalYield: 4,
  prepTime: '20m',
  cookTime: '1h',
  ingredients: [],
  steps: [],
  createdAt: 1,
  updatedAt: 1,
};

function renderEditorAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/recipes/${id}/edit`]}>
      <Routes>
        <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
        <Route path="/recipes" element={<div>Library</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RecipeEditor — header + ingredients', () => {
  it('loads an existing recipe and shows its title', async () => {
    await db.recipes.put(seed);
    renderEditorAt(seed.id);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Seed Recipe')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('20m')).toBeInTheDocument();
  });

  it('edits the title and saves', async () => {
    await db.recipes.put(seed);
    renderEditorAt(seed.id);
    const titleInput = await screen.findByDisplayValue('Seed Recipe');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(async () => {
      const updated = await db.recipes.get(seed.id);
      expect(updated?.title).toBe('Renamed');
    });
  });

  it('adds and removes an ingredient', async () => {
    await db.recipes.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Recipe');

    await userEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
    // After adding, there should be one ingredient row.
    expect(screen.getAllByLabelText('Ingredient name')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /remove ingredient/i }));
    expect(screen.queryByLabelText('Ingredient name')).toBeNull();
  });

  it('shows not-found message for unknown recipe id', async () => {
    renderEditorAt('does-not-exist');
    await waitFor(() => {
      expect(screen.getByText(/recipe not found/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run — expect failure**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/ui/pages/RecipeEditor.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the editor (header + ingredients only)**

Create `chefflow/src/ui/pages/RecipeEditor.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import IngredientRow, { blankIngredient } from '../components/IngredientRow';
import { getRecipe, saveRecipe } from '../../db/recipesRepo';
import type { Recipe, Ingredient } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; recipe: Recipe };

export default function RecipeEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRecipe(id).then((recipe) => {
      if (cancelled) return;
      if (!recipe) {
        setState({ kind: 'not-found' });
      } else {
        setState({ kind: 'ready', recipe });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === 'loading') return <div className="p-6 text-slate-500">Loading…</div>;
  if (state.kind === 'not-found') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Recipe not found.</h1>
        <button type="button" onClick={() => navigate('/recipes')} className="btn-secondary mt-4">
          Back to library
        </button>
      </div>
    );
  }

  const r = state.recipe;

  function update<K extends keyof Recipe>(key: K, value: Recipe[K]) {
    setState({ kind: 'ready', recipe: { ...r, [key]: value } });
    setDirty(true);
  }

  function updateIngredient(idx: number, next: Ingredient) {
    const nextList = r.ingredients.slice();
    nextList[idx] = next;
    update('ingredients', nextList);
  }

  function addIngredient() {
    update('ingredients', [...r.ingredients, blankIngredient()]);
  }

  function removeIngredient(idx: number) {
    update('ingredients', r.ingredients.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    await saveRecipe({ ...r, updatedAt: Date.now() });
    setDirty(false);
    navigate('/recipes');
  }

  function handleCancel() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    navigate('/recipes');
  }

  return (
    <section className="p-4 md:p-6">
      <header className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-2xl font-bold">Edit recipe</h1>
        <div className="flex gap-2">
          <button type="button" onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} className="btn-primary">
            Save
          </button>
        </div>
      </header>

      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input
            type="text"
            value={r.title}
            onChange={(e) => update('title', e.target.value)}
            className="input mt-1"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Yield (portions)</span>
            <input
              type="number"
              min={1}
              value={r.originalYield}
              onChange={(e) => update('originalYield', Math.max(1, Number(e.target.value)))}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Prep time</span>
            <input
              type="text"
              placeholder="30m"
              value={r.prepTime ?? ''}
              onChange={(e) => update('prepTime', e.target.value || undefined)}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Cook time</span>
            <input
              type="text"
              placeholder="2h"
              value={r.cookTime ?? ''}
              onChange={(e) => update('cookTime', e.target.value || undefined)}
              className="input mt-1"
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Ingredients</legend>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {r.ingredients.map((ing, i) => (
              <IngredientRow
                key={ing.id}
                value={ing}
                onChange={(next) => updateIngredient(i, next)}
                onRemove={() => removeIngredient(i)}
              />
            ))}
          </ul>
          <button type="button" onClick={addIngredient} className="btn-secondary mt-3">
            Add ingredient
          </button>
        </fieldset>
      </form>
    </section>
  );
}
```

- [ ] **Step 5: Wire the editor into the router**

In `chefflow/src/App.tsx`, replace the `RecipeEditorStub` import-and-element with the real editor:

Old:
```tsx
function RecipeEditorStub() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Edit Recipe</h1></div>;
}
// ...
<Route path="/recipes/:id/edit" element={<RecipeEditorStub />} />
```
New:
```tsx
import RecipeEditor from './ui/pages/RecipeEditor';
// ...
<Route path="/recipes/:id/edit" element={<RecipeEditor />} />
```
Remove the now-unused `RecipeEditorStub` function.

- [ ] **Step 6: Run — expect tests pass**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/ui/pages/RecipeEditor.test.tsx
```
Expected: 4 passing.

- [ ] **Step 7: Full suite**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run
```
Expected: 73 passing.

- [ ] **Step 8: Commit**

```bash
cd "/Users/derekshek/vs code" && git add chefflow/src/
git commit -m "feat(ui): recipe editor header + ingredients"
```

---

## Task 7: Recipe Editor — Steps with Metadata

**Files:**
- Create: `chefflow/src/ui/components/StepRow.tsx`
- Modify: `chefflow/src/ui/pages/RecipeEditor.tsx`
- Modify: `chefflow/src/ui/pages/RecipeEditor.test.tsx`

Steps need: text, kind toggle (Active/Passive), thermal class chip, allergen toggle, phase, depends-on multi-select, timer-insert button, equipment tags, and the rarely-used batch-key/pan-capacity fields. To keep the UI tidy: show core controls always; tuck thermal/allergen/phase/deps/batch/pan-capacity behind an "Advanced" expander on each row.

- [ ] **Step 1: Create `StepRow`**

Create `chefflow/src/ui/components/StepRow.tsx`:
```tsx
import { useState } from 'react';
import type { WorkflowStep, ThermalClass, AllergenClass, StepKind, StepPhase } from '../../core/types';
import { randomId } from '../../core/util/id';

interface Props {
  index: number;                    // 0-based for label
  value: WorkflowStep;
  earlierSteps: WorkflowStep[];     // for "depends on" picker
  onChange: (next: WorkflowStep) => void;
  onRemove: () => void;
}

const THERMAL: ThermalClass[] = ['normal', 'stable', 'flash'];
const PHASES: StepPhase[] = ['prep', 'cook', 'serve'];

export default function StepRow({ index, value, earlierSteps, onChange, onRemove }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function update<K extends keyof WorkflowStep>(key: K, v: WorkflowStep[K]) {
    onChange({ ...value, [key]: v });
  }

  function insertTimer() {
    const seconds = window.prompt('Timer length in seconds?', '300');
    if (!seconds || !/^\d+$/.test(seconds)) return;
    const tag = `<Timer duration="${seconds}s">${seconds}s</Timer>`;
    update('text', `${value.text} ${tag}`.trim());
    update('durationSec', Number(seconds));
  }

  return (
    <li className="border border-slate-200 dark:border-slate-700 rounded-md p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-sm font-semibold w-6 pt-2">{index + 1}.</span>
        <textarea
          value={value.text}
          onChange={(e) => update('text', e.target.value)}
          className="input flex-1 min-h-[3rem]"
          rows={2}
          aria-label={`Step ${index + 1} text`}
          placeholder="Describe this step…"
        />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <select
          value={value.kind}
          onChange={(e) => update('kind', e.target.value as StepKind)}
          className="input w-32"
          aria-label="Step kind"
        >
          <option value="active">Active</option>
          <option value="passive">Passive</option>
        </select>

        <button type="button" onClick={insertTimer} className="btn-secondary text-sm">
          ⏱ Add timer
        </button>

        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="btn-secondary text-sm"
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? 'Hide advanced' : 'Advanced'}
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="btn-danger text-sm ml-auto"
          aria-label={`Remove step ${index + 1}`}
        >
          Remove
        </button>
      </div>

      {advancedOpen && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <label className="text-sm">
            <span className="block mb-1">Thermal class</span>
            <select
              value={value.thermalClass}
              onChange={(e) => update('thermalClass', e.target.value as ThermalClass)}
              className="input"
            >
              {THERMAL.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block mb-1">Phase</span>
            <select
              value={value.phase}
              onChange={(e) => update('phase', e.target.value as StepPhase)}
              className="input"
            >
              {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block mb-1">Allergen</span>
            <select
              value={value.allergenClass}
              onChange={(e) => update('allergenClass', e.target.value as AllergenClass)}
              className="input"
            >
              <option value="allergen-free">allergen-free</option>
              <option value="allergen">allergen</option>
            </select>
          </label>
          <label className="text-sm md:col-span-3">
            <span className="block mb-1">Depends on</span>
            <select
              multiple
              value={value.dependsOn}
              onChange={(e) =>
                update(
                  'dependsOn',
                  Array.from(e.target.selectedOptions).map((o) => o.value)
                )
              }
              className="input h-24"
            >
              {earlierSteps.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {s.text.slice(0, 40) || s.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block mb-1">Batch key</span>
            <input
              type="text"
              value={value.batchKey ?? ''}
              onChange={(e) => update('batchKey', e.target.value || undefined)}
              className="input"
              placeholder="chop:onion"
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1">Pan capacity</span>
            <input
              type="number"
              min={1}
              value={value.panCapacityPortions ?? ''}
              onChange={(e) =>
                update('panCapacityPortions', e.target.value ? Number(e.target.value) : undefined)
              }
              className="input"
              placeholder="(none)"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="block mb-1">Equipment (comma-separated)</span>
            <input
              type="text"
              value={value.equipment?.join(', ') ?? ''}
              onChange={(e) =>
                update(
                  'equipment',
                  e.target.value ? e.target.value.split(',').map((s) => s.trim()) : undefined
                )
              }
              className="input"
              placeholder="oven@180C, wok"
            />
          </label>
        </div>
      )}
    </li>
  );
}

export function blankStep(): WorkflowStep {
  return {
    id: randomId(),
    text: '',
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOn: [],
    phase: 'cook',
  };
}
```

- [ ] **Step 2: Append failing step tests to the editor test file**

Append to `chefflow/src/ui/pages/RecipeEditor.test.tsx`:
```ts
describe('RecipeEditor — steps', () => {
  it('adds a step and persists it on save', async () => {
    await db.recipes.put(seed);
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Seed Recipe');

    await userEvent.click(screen.getByRole('button', { name: /add step/i }));
    const stepTextarea = screen.getByLabelText(/step 1 text/i);
    await userEvent.type(stepTextarea, 'Sear the beef');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(async () => {
      const updated = await db.recipes.get(seed.id);
      expect(updated?.steps).toHaveLength(1);
      expect(updated?.steps[0].text).toBe('Sear the beef');
    });
  });

  it('removes a step', async () => {
    await db.recipes.put({ ...seed, steps: [{
      id: 's1', text: 'Existing', kind: 'active',
      thermalClass: 'normal', allergenClass: 'allergen-free',
      dependsOn: [], phase: 'cook'
    }] });
    renderEditorAt(seed.id);
    await screen.findByDisplayValue('Existing');

    await userEvent.click(screen.getByRole('button', { name: /remove step 1/i }));
    expect(screen.queryByDisplayValue('Existing')).toBeNull();
  });
});
```

- [ ] **Step 3: Run — expect failures**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/ui/pages/RecipeEditor.test.tsx
```
Expected: 4 passing (Task 6) + 2 failing (no Add step / Remove step buttons yet).

- [ ] **Step 4: Add steps section to the editor**

In `chefflow/src/ui/pages/RecipeEditor.tsx`, just before the closing `</form>` tag, add:

```tsx
<fieldset>
  <legend className="text-sm font-medium">Steps</legend>
  <ul className="space-y-3">
    {r.steps.map((s, i) => (
      <StepRow
        key={s.id}
        index={i}
        value={s}
        earlierSteps={r.steps.slice(0, i)}
        onChange={(next) => updateStep(i, next)}
        onRemove={() => removeStep(i)}
      />
    ))}
  </ul>
  <button type="button" onClick={addStep} className="btn-secondary mt-3">
    Add step
  </button>
</fieldset>
```

And add these handlers + import inside the same file:

Imports section (add):
```tsx
import StepRow, { blankStep } from '../components/StepRow';
import type { WorkflowStep } from '../../core/types';
```
(Adjust the existing imports — `WorkflowStep` may need adding to the type import line.)

Helpers inside the component:
```tsx
function updateStep(idx: number, next: WorkflowStep) {
  const nextList = r.steps.slice();
  nextList[idx] = next;
  update('steps', nextList);
}

function addStep() {
  update('steps', [...r.steps, blankStep()]);
}

function removeStep(idx: number) {
  update('steps', r.steps.filter((_, i) => i !== idx));
}
```

- [ ] **Step 5: Run — expect tests pass**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run -- src/ui/pages/RecipeEditor.test.tsx
```
Expected: 6 passing.

- [ ] **Step 6: Full suite**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run
```
Expected: 75 passing.

- [ ] **Step 7: Commit**

```bash
cd "/Users/derekshek/vs code" && git add chefflow/src/
git commit -m "feat(ui): recipe editor steps with advanced metadata"
```

---

## Task 8: Live Markdown Preview Pane

**Files:**
- Create: `chefflow/src/ui/components/MarkdownPreview.tsx`
- Modify: `chefflow/src/ui/pages/RecipeEditor.tsx`

The preview pane shows what the recipe looks like rendered. It uses `serializeRecipe` from Plan 1 to convert the current state to markdown, then `react-markdown` to render it.

- [ ] **Step 1: Create `MarkdownPreview`**

Create `chefflow/src/ui/components/MarkdownPreview.tsx`:
```tsx
import ReactMarkdown from 'react-markdown';
import type { Recipe } from '../../core/types';
import { serializeRecipe } from '../../core/parser/serializeRecipe';

export default function MarkdownPreview({ recipe }: { recipe: Recipe }) {
  const md = serializeRecipe(recipe);
  return (
    <article
      className="prose prose-slate dark:prose-invert max-w-none
                 p-4 border border-slate-200 dark:border-slate-700 rounded-md
                 bg-slate-50 dark:bg-kitchen-ink overflow-auto"
      aria-label="Recipe preview"
    >
      <ReactMarkdown>{md}</ReactMarkdown>
      <details className="mt-4 text-xs text-slate-500">
        <summary>View raw markdown</summary>
        <pre className="whitespace-pre-wrap mt-2 text-xs">{md}</pre>
      </details>
    </article>
  );
}
```

- [ ] **Step 2: Install `@tailwindcss/typography` for the `prose` class**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm install -D @tailwindcss/typography
```

Then update `chefflow/tailwind.config.ts` plugins array:
```ts
import typography from '@tailwindcss/typography';
// ...
plugins: [typography],
```

- [ ] **Step 3: Wire the preview into the editor as a two-pane layout**

In `chefflow/src/ui/pages/RecipeEditor.tsx`:

1. Add the import near the top: `import MarkdownPreview from '../components/MarkdownPreview';`
2. Wrap the existing `<form>` and a new `<MarkdownPreview>` in a two-column grid. Replace the existing return JSX inside `state.kind === 'ready'` branch with:

```tsx
return (
  <section className="p-4 md:p-6">
    <header className="flex items-center justify-between mb-4 gap-2">
      <h1 className="text-2xl font-bold">Edit recipe</h1>
      <div className="flex gap-2">
        <button type="button" onClick={handleCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={() => void handleSave()} className="btn-primary">
          Save
        </button>
      </div>
    </header>

    <div className="grid gap-4 md:grid-cols-2">
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        {/* existing label/inputs/fieldsets, unchanged */}
      </form>
      <MarkdownPreview recipe={r} />
    </div>
  </section>
);
```

(Keep all the form contents from Task 7 — only the wrapping layout changes.)

- [ ] **Step 4: Sanity-check the dev server renders the editor without crashing**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && ( timeout 10 npm run dev 2>&1 || true ) | grep -iE "(vite|ready|error)"
```
Expected: `VITE v… ready`.

- [ ] **Step 5: Full suite (no test changes — existing tests should still pass since the form is unchanged)**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run
```
Expected: 75 passing.

- [ ] **Step 6: Commit**

```bash
cd "/Users/derekshek/vs code" && git add chefflow/
git commit -m "feat(ui): live markdown preview in recipe editor"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Type check**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 2: Full test suite**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run test:run
```
Expected: 75 passing.

- [ ] **Step 3: Production build**

```bash
. ~/.nvm/nvm.sh && cd "/Users/derekshek/vs code/chefflow" && npm run build
```
Expected: `dist/` produced; no errors.

- [ ] **Step 4: Manual smoke test instructions for the user**

Document the smoke test in the commit message (since there's no automated E2E):
1. `cd "/Users/derekshek/vs code/chefflow" && . ~/.nvm/nvm.sh && npm run dev`
2. Open `http://localhost:5173/` — should redirect to `/recipes`.
3. Empty library → "Create your first recipe" → opens editor.
4. Type a title, set yield = 4, add an ingredient (e.g. 800 g Beef Chuck), add a step "Sear the beef", click **Save**.
5. Back on the library, the recipe card should show.
6. Reload the browser — the recipe should still be there (IndexedDB persistence).
7. Click **Edit** → modify something → click **Cancel** with unsaved changes → confirm dialog appears.
8. Duplicate → "(copy)" version appears.
9. Delete → confirm → card disappears.

- [ ] **Step 5: Commit any incidental fixes**

```bash
cd "/Users/derekshek/vs code" && git status
```
If anything is unstaged, commit with a `chore:` message. Otherwise skip.

---

## Plan 2a Done — What You Have

- Browser-visible ChefFlow at `/recipes` with a full CRUD loop:
  - Library page with cards, create / duplicate / delete
  - Dual-pane editor with structured form + live markdown preview
  - IndexedDB persistence — recipes survive reload
- Bottom-nav app shell with Recipes + Events tabs (Events is a placeholder)
- Zustand store for the global unit-system preference (used by Plan 3 onward)
- React Testing Library coverage for library and editor pages
- 75 total tests passing

## What's Next (Plan 2b)

Plan 2b will add the three sharing transports:
- URL-hash share/import with `lz-string`
- Export `.md` file download
- Import `.md` file picker
- Copy markdown to clipboard
- Import-preview screen with title-collision dialog

We re-spec just-in-time before writing it.
