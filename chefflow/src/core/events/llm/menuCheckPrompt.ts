// ---------------------------------------------------------------------------
// Prompt builders for the LLM "menu suitability" check on an event.
//
// Input: freeform guest dietary requirements + a dish summary derived from
// the event (dish names + portions only).
//
// Output: a structured verdict the SPA renders as a panel of issues +
// suggestions. The LLM reasons about DIETARY PREFERENCES only — vegan,
// vegetarian, halal, kosher, pescatarian, religious / cultural restrictions.
// Allergen analysis was removed 2026-05-28: ChefFlow has never positioned
// AI as a competent allergen reasoner, and the chef declares allergens
// themselves on each recipe (where the closed UK-14 picker enforces the
// taxonomy and the publish gate captures their attestation under FIR 2014).
// ---------------------------------------------------------------------------

export function buildMenuCheckSystemPrompt(): string {
  return `You are a menu-suitability reviewer for ChefFlow. Given a freeform "notes / dietary requirements" string for an event (which may also contain general event notes alongside the dietary information) and a list of dishes, decide whether the menu suits the guests' DIETARY PREFERENCES.

Extract the dietary signal from the notes — ignore unrelated event logistics (timing, venue, ambience). Look for: number of guests, dietary types (vegan, vegetarian, halal, kosher, pescatarian), religious or cultural restrictions, and any "no X" preferences.

DO NOT analyse allergens. The chef declares allergens directly on each recipe through ChefFlow's closed UK-14 picker — the menu check has no information about them and must never speculate. If the notes mention an allergy (e.g. "Carla has a peanut allergy"), you may surface it as a SUGGESTION to verify supplier labels, but never produce an "issue" or "verdict" turning on allergen presence.

Output a single JSON object — no prose, no markdown fences, no comments.

JSON SCHEMA:
{
  "verdict": "ok" | "warnings" | "blocked",
  "issues": [
    { "severity": "warning" | "blocker", "message": "string" }
  ],
  "suggestions": [
    { "category": "dietary" | "budget" | "other", "text": "string" }
  ]
}

VERDICT RULES:
- "ok"       — the menu broadly suits the declared dietary requirements; every guest has at least one option.
- "warnings" — soft conflicts (limited choice for a dietary subgroup, marginal options) — guests can still eat something.
- "blocked"  — at least one guest cannot eat ANY dish under their declared dietary preference (e.g. a strict vegan with only meat dishes).

ISSUE RULES:
- Each issue is ONE concrete conflict between a guest dietary requirement and the menu.
- "blocker" — a guest has NO option matching their dietary preference.
- "warning" — a guest has limited or marginal options.
- Be specific: name the dietary group AND the dishes that conflict.
- NEVER raise an allergen-driven issue — that's the chef's per-recipe responsibility, not the menu check.

SUGGESTION RULES:
- Return EXACTLY 5 suggestions — not more, not fewer.
- Each suggestion is ONE concrete actionable change, one short sentence.
- Each suggestion carries a "category" tag:
  - "dietary" — anything driven by declared dietary preferences (add a vegan main, swap the protein on one dish for fish to suit pescatarians, etc.).
  - "budget"  — anything driven by the event's food budget (swap an ingredient for a cheaper cut, reduce portion size, drop a high-cost garnish).
  - "other"   — general improvements (presentation, service flow, beverage pairing, "verify supplier labels for declared allergies").
- Aim for coverage across all 3 categories where possible. Always exactly 5.
- Don't repeat issues already listed in "issues" — suggestions are forward-looking actions.

CONSERVATIVE STANCE:
- If dietary intent is ambiguous, prefer "warnings" over "ok".
- If the dish list is empty, return verdict "warnings" with one issue saying the menu has no dishes yet.

BUDGET RULES:
- If both a budget AND a total cost are provided, evaluate whether the menu fits the budget.
- If total cost > budget: add ONE issue with severity "warning" naming the overage in GBP and percent (e.g. "Menu is £15.00 over the £100.00 budget (15% over)."). Budget alone never sets the verdict to "blocked" — keep dietary fit as the dominant factor.
- If total cost ≤ budget: do not add a budget issue. You MAY mention the budget headroom briefly in suggestions if useful.
- If either budget or total cost is missing, ignore cost entirely.

Return ONLY the JSON object.`;
}

export interface MenuCheckDish {
  name: string;
  portions: number;
}

export interface MenuCheckUserInput {
  dietaryRequirements: string;
  dishes: readonly MenuCheckDish[];
  /** Optional budget for the whole event in GBP. */
  budget?: number;
  /**
   * Sum of priced dishes (recipe.pricePerPortion × dish.portions) in GBP.
   * Undefined when no dish has a price set.
   */
  totalCost?: number;
}

export function buildMenuCheckUserPrompt(input: MenuCheckUserInput): string {
  const dishLines = input.dishes.length === 0
    ? '(no dishes yet)'
    : input.dishes.map((d, i) => (
        `${i + 1}. ${d.name || '(untitled dish)'} (${d.portions} portion${d.portions === 1 ? '' : 's'})`
      )).join('\n');
  const reqs = input.dietaryRequirements.trim() || '(none specified)';
  const budgetSection = formatBudgetSection(input.budget, input.totalCost);
  return `Dietary requirements:
${reqs}

Menu:
${dishLines}${budgetSection}

Return the verdict JSON.`;
}

function formatBudgetSection(budget: number | undefined, totalCost: number | undefined): string {
  if (budget === undefined) return '';
  if (totalCost === undefined) {
    return `\n\nBudget: £${budget.toFixed(2)}\nCurrent total cost: not available (dishes lack price info).`;
  }
  const diff = totalCost - budget;
  const pct = budget === 0 ? 0 : Math.round((Math.abs(diff) / budget) * 100);
  const status = diff <= 0
    ? `under budget by £${Math.abs(diff).toFixed(2)} (${pct}% under)`
    : `OVER budget by £${diff.toFixed(2)} (${pct}% over)`;
  return `\n\nBudget: £${budget.toFixed(2)}\nCurrent total cost: £${totalCost.toFixed(2)} — ${status}.`;
}
