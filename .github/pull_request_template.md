## What changed
<!-- 1-3 sentences. The WHAT and the WHY. -->

## Screenshots (UI changes only)
<!-- Before/after, or a fresh capture for new surfaces. Mobile + desktop if both are affected. -->

## How to test
<!-- Concrete steps a reviewer can follow locally. -->

## Checklist
- [ ] `npm run test:run` passes (SPA Vitest, 693+ specs)
- [ ] `npm test` passes (worker Vitest, 267+ specs)
- [ ] `npm run test:e2e` passes (Playwright, 24+ specs) — or N/A if no UI / API change
- [ ] `npx tsc --noEmit` passes in both projects
- [ ] New behaviour has at least one test that pins the WHY, not just the WHAT
- [ ] I read [CONTRIBUTING.md](../CONTRIBUTING.md) and this PR doesn't touch the high-risk subsystems listed there (or, if it does, an issue exists discussing the change)

## Related issue
<!-- Closes #123 / Refs #456 -->
