# E2E Test Run Log

Append one row per Playwright run. Format: `npx playwright test --reporter=line` from the `chefflow/` directory.

| Date | Commit | Spec | Result | Notes |
|------|--------|------|--------|-------|
| 2026-05-20 | fd1c3e7 | event-review-step.spec.ts | 6/6 pass | Baseline. No regressions from data-testid additions to DishRow, EventView, EventDetailsSheet, GenerateRecipeSheet. |
| 2026-05-20 | fd1c3e7 | recipe-new.spec.ts | 3/3 pass | New spec. data-testid added to GenerateRecipeSheet (tabs, textarea, photo input, photo pick button, submit/create-blank buttons) and RecipeEditor (title input). |
| 2026-05-20 | fd1c3e7 | event-new-mixed-dishes.spec.ts | 4/4 pass | New spec. Covers auto-match, create-new-stub navigation, ready-to-go, and full resolve-then-create flow. |
| 2026-05-20 | fd1c3e7 | event-view-inline-edit.spec.ts | 5/5 pass | New spec. data-testid added to DishRow (dish-row, data-dish-id, dish-row-edit, dish-row-remove), EventView (event-view-title, event-view-edit-details), EventDetailsSheet (event-details-title-input, event-details-save). |
| 2026-05-20 | fd1c3e7 | ALL (18 tests, 4 workers) | 18/18 pass | Full suite run. vitest 282/282 also green. |
| 2026-05-20 | 2da62b3 | ALL (18 tests) | 18/18 pass | Regression run after tier foundation (be0fcb5) + DishRow timeline restructure (2da62b3). DishRow now renders a single-row layout with time/name/portions/£·portion/total. EventView inline-edit specs unaffected (selectors stable: dish-row, dish-row-edit, dish-row-remove). vitest 297/297 (15 new tier limits tests). |
| 2026-05-20 | 4c8c41b | ALL (18 tests) | 18/18 pass | Regression run after DishRow click-to-edit price-per-portion landed. Price writes back to the LINKED RECIPE via saveRecipe (no dish-level price). vitest 300/300 (3 new DishRow price-edit unit tests). Selectors unchanged. |
