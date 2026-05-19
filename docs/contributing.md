# Contributing

## Prerequisites

Before making changes, confirm you can run the full test suite:

```bash
cd chefflow
npm install
npm run test:run
```

All tests must pass before you open a pull request.

## Branching

Work from feature branches off `main`. Name branches after the work:

```
feat/short-description
fix/short-description
chore/short-description
test/short-description
```

The current in-flight branch is `feat/public-deploy-with-auth`.

## Commit style

This project uses Conventional Commits. Every commit message follows:

```
type(scope): imperative short description
```

Examples from the project's `git log`:

```
feat(recipes): per-ingredient allergen override with user toggle
fix(recipes/llm): extract JSON from prose preamble (vision-model chatter)
fix(worker): set max_tokens=4096 (default 256 truncates recipe JSON)
test(recipes/llm): cover findAllergensInIngredient regex matcher
chore(worker): bump wrangler to v4 (silences deprecation warning)
```

**Types in use:**

| Type | When to use |
|------|-------------|
| `feat` | New user-visible feature |
| `fix` | Bug fix |
| `test` | Adding or changing tests only |
| `chore` | Tooling, deps, config — no production behavior change |
| `refactor` | Internal restructuring with no behavior change |
| `docs` | Documentation only |

Keep the subject line under 72 characters. Add a body if the commit resolves a non-obvious problem.

## Development commands

All commands run from the `chefflow/` directory.

```bash
npm run dev          # start dev server (http://localhost:5173)
npm run build        # type-check + production bundle
npm run lint         # ESLint (fails the CI gate on errors)
npm run test         # Vitest in watch mode
npm run test:run     # Vitest single-run (use in CI / pre-commit checks)
npm run preview      # serve the production build locally
```

Worker commands (run from `chefflow-worker/`):

```bash
npm run dev          # wrangler dev on http://localhost:8787
npm run test         # Vitest single-run
npm run typecheck    # tsc --noEmit
npm run deploy       # wrangler deploy (requires Cloudflare auth)
```

## Code standards

These standards come from `CLAUDE.md`:

- **Decimal.js**: Use `decimal.js` for all unit math. Do not use native `number` arithmetic for amounts that will be displayed to users — floating-point drift produces `0.30000000000000004`-style output.
- **Parser / engine separation**: Keep conversion and scaling logic in `core/` modules. UI components must not contain unit math.
- **Accessibility**: Timers must have audible alerts via the Web Audio API. Interactive elements must meet the 48px minimum touch target (`touch-target` utility class).
- **Test coverage**: Write tests alongside new core modules. The `scaleRecipe`, `convertUnit`, and `scheduleEvent` modules each have dedicated test files.

## Testing conventions

Tests use Vitest + `@testing-library/react` and run in a jsdom environment (`chefflow/vite.config.ts`).

- Test files are co-located with source files, using the `.test.ts` / `.test.tsx` suffix.
- IndexedDB tests use `fake-indexeddb` (see `chefflow/src/vitest.setup.ts`).
- Core engine tests (unit conversion, scaling, scheduling) do not require React — they are plain TypeScript `describe`/`it` blocks.

## State-persistence protocol

This project uses a two-file state-persistence protocol for autonomous agent sessions, described in `CLAUDE.md §  Agent Protocol — State Persistence`. As a human contributor, be aware of:

- **`TODO_PERSISTENCE.md`** (repo root): Agent-owned. Contains in-flight work from the previous session. Do not edit manually. It is cleared automatically when tasks are confirmed complete.
- **`ToDoList.md`** (repo root): User-curated backlog. Add deferred features, bugs, and security follow-ups here.

When you complete a task that appears in `TODO_PERSISTENCE.md`, remove that line immediately to keep the file lean.

## Agent protocol

This project uses Claude Code agents for autonomous development sessions. The agent rules, state-persistence protocol, and product cycle are defined in [`CLAUDE.md`](../CLAUDE.md) at the repo root — read it before starting any non-trivial task. The 12 engineering rules there govern both agent and human work; they are not restated here.

Named agents and where their definitions live:

- **Project manager** — `~/.claude/agents/` (user-level)
- **Blueprint Architect** — `~/.claude/agents/` (user-level)
- **Fullstack Engineer** — `~/.claude/agents/` (user-level)
- **UI-engineer** — `~/.claude/agents/` (user-level)
- **QA-engineer** — `~/.claude/agents/` (user-level)
- **Security Auditor** — `~/.claude/agents/` (user-level)
- **Docs-engineer** — `~/.claude/agents/` (user-level)

Project-level agent overrides (if any) live in `.claude/agents/` at the repo root.

## Pull request checklist

Before opening a PR:

- [ ] `npm run test:run` passes with no failures
- [ ] `npm run lint` produces no errors
- [ ] `npm run build` succeeds (type-check + bundle)
- [ ] New core logic has accompanying tests
- [ ] Commit messages follow Conventional Commits style
- [ ] `TODO_PERSISTENCE.md` is cleaned up if you completed in-flight tasks
