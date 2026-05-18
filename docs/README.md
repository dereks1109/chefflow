# ChefFlow

ChefFlow is a mobile-first web application for professional chefs to manage kitchen operations. It transforms static recipes into interactive, scaled, unit-aware workflows for live kitchen use — from a single portion up to a banquet service.

## Who it is for

Professional chefs and catering teams who need to:

- Scale recipes from 4 covers to 50 covers in one tap
- Coordinate multi-recipe kitchen timelines with dependency-aware scheduling
- Track dietary allergens across every dish on an event
- Work in harsh kitchen lighting with large touch targets and a dark UI

## Features

| Area | What it does |
|------|-------------|
| **Recipe Library** | Create, edit, and pin recipes stored as structured Markdown in IndexedDB |
| **Ingredient scaling** | Linear portion scaler with per-ingredient lock (salt, spices stay fixed) |
| **Unit conversion** | Metric / Imperial / Auto toggle; normalizes g→kg, ml→L, oz→lb automatically |
| **Allergen detection** | Per-ingredient allergen flags against the UK 14-allergen taxonomy |
| **Events** | Plan a kitchen event: dishes, sections (Starters/Mains), serve time, venue, contact, budget |
| **Workflow scheduler** | Builds a time-ordered prep plan for all dishes on an event, respecting culinary rules |
| **LLM integration** | Generate recipes from text, analyze photos, check menu suitability, draft workflows |
| **Command palette** | `Cmd-K` / `Ctrl-K` fuzzy navigation across all pages |
| **Theme toggle** | Dark mode (default, kitchen-optimized) and light mode |
| **Auth gate** | Clerk-backed sign-in; all routes require authentication |

## Project layout (top level)

```
chefflow/          Vite + React SPA (the main app)
chefflow-worker/   Cloudflare Worker — LLM proxy
CulinaryRule.md    Culinary scheduling rules (baked into the LLM prompt at build time)
CLAUDE.md          Project specs and agent protocol
docs/              Developer documentation (you are here)
ToDoList.md        Backlog and roadmap
```

## Documentation

| File | Contents |
|------|----------|
| [getting-started.md](./getting-started.md) | Clone, install, env vars, first run |
| [architecture.md](./architecture.md) | System overview, folder tree, data flow |
| [data-model.md](./data-model.md) | Domain types, Dexie schema, recipe Markdown format |
| [unit-system.md](./unit-system.md) | Unit conversion engine, scaling, normalization |
| [ui-conventions.md](./ui-conventions.md) | Surface tokens, dark mode, touch targets, CSS utilities |
| [contributing.md](./contributing.md) | Branching, commits, lint/test commands, state-persistence protocol |
| [deployment.md](./deployment.md) | Cloudflare Pages + Worker deployment |

## Tech stack at a glance

- **React 19** + **Vite 8** + **TypeScript 6**
- **Tailwind CSS 3** with custom surface token palette
- **Zustand 5** for global state (unit system)
- **Dexie 4** (IndexedDB) for offline persistence
- **Clerk** for authentication (`@clerk/clerk-react`)
- **Cloudflare Workers AI** for LLM inference (proxied through `chefflow-worker/`)
- **Vitest** for unit and integration tests
- **`@hello-pangea/dnd`** for drag-and-drop
- **`decimal.js`** for precision arithmetic in the unit engine
