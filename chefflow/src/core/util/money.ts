// Currency formatter. ChefFlow uses GBP throughout — UK food-business focus
// (matches the UK-14 allergen taxonomy in core/recipes/llm/allergens.ts).
const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

export function formatGBP(amount: number): string {
  return GBP.format(amount);
}
