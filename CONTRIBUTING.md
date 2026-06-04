# Contributing to ChefFlow

Thanks for thinking about a contribution. ChefFlow is a small project run by one person (with a lot of help from Claude Code) — that means I'll read every issue and PR, but please be patient if it takes a few days.

This guide covers:

1. [Good first PRs](#good-first-prs) — where to land if you've never touched the code
2. [Subsystems to avoid as a first PR](#subsystems-to-avoid-as-a-first-pr) — high-blast-radius areas
3. [Dev workflow](#dev-workflow)
4. [Code conventions](#code-conventions)
5. [Filing issues](#filing-issues)
6. [Reporting security issues](#reporting-security-issues)

---

## Good first PRs

Each of these is self-contained, has clear acceptance criteria, and won't accidentally touch billing / sync / auth.

| # | Category | What to do | Entry file |
|---|---|---|---|
| 1 | **Recipe seed expansions** | Add regional starter recipes to the demo seed (Indian, Thai, Mexican, etc.). One recipe per PR is fine. | [`chefflow-worker/src/demoSeed.ts`](chefflow-worker/src/demoSeed.ts) |
| 2 | **Allergen taxonomy translations** | UK 14 allergen labels + ingredient examples in another language (French, Spanish, etc.). Pure data; no logic. | [`chefflow/src/core/recipes/llm/allergens.ts`](chefflow/src/core/recipes/llm/allergens.ts) |
| 3 | **Unit conversion edge cases** | Add Vitest specs for unhandled ingredient/unit pairs (e.g. tsp ↔ ml for liquid spices). Test-only. | [`chefflow/src/core/units/`](chefflow/src/core/units/) |
| 4 | **Accessibility audit** | ARIA labels, keyboard nav, 48px touch targets on one component at a time. Pair with a focused issue. | [`chefflow/src/ui/components/`](chefflow/src/ui/components/) |
| 5 | **E2E coverage gaps** | Add Playwright specs for known gaps documented in [`chefflow/e2e/TEST_CASES.md`](chefflow/e2e/TEST_CASES.md): photo upload, drag-drop sections, sign-in round-trip. | [`chefflow/e2e/`](chefflow/e2e/) |
| 6 | **Documentation polish** | Typos, broken links, screenshot refreshes, clearer examples. Lowest-risk path for first-time contributors. | [`docs/`](docs/) + this repo's root docs |

If you're not sure whether your idea fits, **open an issue first** with the proposal — much better to talk shape before you've written code that needs to be rewritten.

---

## Subsystems to avoid as a first PR

Not because contributions are unwelcome, but because mistakes here have high blast radius (data loss, billing bugs, auth bypass). If you want to work on one of these, please open an issue first so we can scope the change together.

| Area | Why it's high-risk |
|---|---|
| **Sync engine** ([`chefflow/src/core/sync/`](chefflow/src/core/sync/) + [`chefflow-worker/src/sync.ts`](chefflow-worker/src/sync.ts)) | LWW reconciliation between IndexedDB and D1. Bugs here corrupt or lose chef data silently. |
| **Stripe billing** ([`chefflow-worker/src/billing.ts`](chefflow-worker/src/billing.ts), [`stripeWebhook.ts`](chefflow-worker/src/stripeWebhook.ts)) | Touches subscription state + payment flows. Mistakes can charge users or leave them without access. |
| **Tier gating** ([`chefflow/src/core/tier/`](chefflow/src/core/tier/), [`TierGate`](chefflow/src/ui/components/), [`PinGate`](chefflow/src/ui/components/)) | Controls paid-feature access. Mistakes unlock features or block paying customers. |
| **Clerk auth + JWT** ([`chefflow-worker/src/auth.ts`](chefflow-worker/src/auth.ts), [`chefflow/src/core/auth/`](chefflow/src/core/auth/)) | Identity layer. Mistakes expose auth bypass or wrong-user reads. |
| **LLM proxy + rate limiting** ([`chefflow-worker/src/quota.ts`](chefflow-worker/src/quota.ts), `/api/llm/*` handlers) | Cost exposure if quotas are relaxed; Groq + Workers AI are paid services. |

---

## Dev workflow

### One-time setup

```bash
git clone https://github.com/dereks1109/chefflow.git
cd chefflow

# SPA
cd chefflow && npm install
# Worker
cd ../chefflow-worker && npm install
```

See the root [README](README.md#configuration) for the env vars + secrets you need to set.

### Per-PR checklist

```bash
# In chefflow/
npm run test:run         # 693 unit specs (Vitest)
npm run test:e2e         # 24 E2E specs (Playwright)
npx tsc --noEmit         # type-check
npm run lint             # eslint
npm run build            # production build

# In chefflow-worker/
npm test                 # 267 unit specs (Vitest)
npm run typecheck
```

All four must pass for a green CI run. The repo's GitHub Actions workflow re-runs them on every push.

### Commit conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(workflow): auto-save snapshot after first generation
fix(sync): treat undefined updated_at as zero
docs: clarify CONTRIBUTING good-first-PR list
test(e2e): seed recipe inline instead of relying on demo provisioning
chore(security): drop preview Pages URL from CORS allow-list
```

Prefixes: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `ui`, `style`, `perf`. Scope (in parens) is optional but helpful.

### Branching

- Branch off `main`
- Open PR against `main`
- Single-purpose PRs preferred — one logical change per PR, not a grab-bag

---

## Code conventions

The codebase follows a strict 12-rule set documented in [`CLAUDE.md`](CLAUDE.md) at the repo root. The short version:

- **Simplicity first** — minimum code that solves the problem; no speculative abstractions
- **Surgical changes** — touch only what you must; don't clean up adjacent code unless asked
- **Test intent, not just behaviour** — tests should encode WHY behaviour matters
- **Match existing conventions** — conformance > taste inside the codebase
- **Fail loud** — surface errors and uncertainty; never silently swallow

Most components and modules have a short comment block at the top explaining what they're for. When in doubt, follow the pattern in a nearby file rather than introducing a new one.

### Naming

- `data-testid` attributes for any element an E2E test asserts on. Format: `<surface>-<element>` (e.g. `event-detail-card-edit`).
- Files: `kebab-case.ts` for non-React modules, `PascalCase.tsx` for components.
- Tests live next to the file they test: `useTheme.ts` → `useTheme.test.ts`.

---

## Filing issues

Use the issue templates — bug report or feature request — that GitHub surfaces when you click "New issue". The templates ask for the bits that make a triage-ready report (steps to reproduce, expected vs actual, browser/OS).

For UX feedback that doesn't fit the bug-report shape, open a "feature request" issue with the type clearly marked at the top.

---

## Reporting security issues

**Please do not file public issues for security vulnerabilities.**

Email security reports to **admin@chefflow.uk** with `[SECURITY]` in the subject. I'll respond within 72 hours and coordinate disclosure.

In-scope:
- Auth bypass / cross-user data leaks
- Stripe/billing flow exploits
- XSS, CSRF, injection bugs in the SPA or worker
- API endpoints that leak data beyond the JWT subject

Out-of-scope:
- Self-XSS, missing security headers on the dev domain, social engineering
- Issues only reproducible against an old commit (we don't backport fixes — please test against `main`)
- Findings from automated scanners without a reproducer

---

Thanks again for considering a contribution.
