// ---------------------------------------------------------------------------
// Prompt builders for the LLM "menu suitability" check on an event.
//
// Input: freeform guest dietary requirements + a dish summary derived from
// the event (dish names + portions, and — when a dish links to a recipe —
// that recipe's declared allergens + key ingredient tags).
//
// Output: a structured verdict the SPA renders as a panel of issues +
// suggestions. The closed UK-14 allergen taxonomy is included so the LLM has
// a stable vocabulary to reason about.
// ---------------------------------------------------------------------------

import { ALLERGEN_TAGS, ALLERGEN_LABEL } from '../../recipes/llm/allergens';

function buildAllergenList(): string {
  return ALLERGEN_TAGS
    .map((tag) => `- "${tag}" — ${ALLERGEN_LABEL[tag]}`)
    .join('\n');
}

export function buildMenuCheckSystemPrompt(): string {
  return `You are a food-service safety reviewer for ChefFlow. Given a freeform "notes / dietary requirements" string for an event (which may also contain general event notes alongside the dietary information) and a list of dishes with their key ingredients + known allergens, decide whether the menu suits the guests.

Extract the dietary signal from the notes — ignore unrelated event logistics (timing, venue, ambience). Look for: number of guests, dietary types (vegan, vegetarian, halal, kosher, pescatarian), allergies, religious or cultural restrictions, and any "no X" preferences.

Output a single JSON object — no prose, no markdown fences, no comments.

JSON SCHEMA:
{
  "verdict": "ok" | "warnings" | "blocked",
  "issues": [
    { "severity": "warning" | "blocker", "message": "string" }
  ],
  "suggestions": [ "string" ]
}

VERDICT RULES:
- "ok"       — every guest can eat at least one dish safely AND the menu broadly suits the declared requirements.
- "warnings" — soft conflicts (limited choice for a dietary subgroup, marginal options) — guests can still eat.
- "blocked"  — at least one guest cannot eat ANY dish safely (e.g. allergen present in every dish; vegan with only meat dishes).

ISSUE RULES:
- Each issue is ONE concrete conflict between a guest requirement and the menu.
- "blocker" — a guest has NO safe option.
- "warning" — a guest has limited or marginal options.
- Be specific: name the dietary group AND the dishes that conflict.

SUGGESTION RULES:
- Each suggestion is ONE concrete actionable change (add a vegan main, swap soy sauce for tamari, etc.).
- Maximum 3 suggestions. One short sentence each.

ALLERGEN VOCABULARY (the closed UK-14 set — use these names in messages):
${buildAllergenList()}

CONSERVATIVE STANCE:
- If a guest declares an allergy matching one of the 14 allergens above, treat any dish carrying that allergen as unsafe for them.
- If dietary intent is ambiguous, prefer "warnings" over "ok".
- If the dish list is empty, return verdict "warnings" with one issue saying the menu has no dishes yet.

BUDGET RULES:
- If both a budget AND a total cost are provided, evaluate whether the menu fits the budget.
- If total cost > budget: add ONE issue with severity "warning" naming the overage in GBP and percent (e.g. "Menu is £15.00 over the £100.00 budget (15% over)."). Budget alone never sets the verdict to "blocked" — keep dietary safety as the dominant factor.
- If total cost ≤ budget: do not add a budget issue. You MAY mention the budget headroom briefly in suggestions if useful.
- If either budget or total cost is missing, ignore cost entirely.

Return ONLY the JSON object.`;
}

export interface MenuCheckDish {
  name: string;
  portions: number;
  allergens?: readonly string[];
  keyIngredients?: readonly string[];
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
    : input.dishes.map((d, i) => {
        const parts = [`${i + 1}. ${d.name || '(untitled dish)'} (${d.portions} portion${d.portions === 1 ? '' : 's'})`];
        if (d.allergens && d.allergens.length > 0) {
          parts.push(`   allergens: [${d.allergens.join(', ')}]`);
        }
        if (d.keyIngredients && d.keyIngredients.length > 0) {
          parts.push(`   key ingredients: [${d.keyIngredients.join(', ')}]`);
        }
        return parts.join('\n');
      }).join('\n');
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
