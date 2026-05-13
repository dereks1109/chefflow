import type { Recipe, Ingredient, WorkflowStep } from '../types';

export function serializeRecipe(r: Recipe): string {
  const fm = [
    '---',
    `recipe_id: "${r.id}"`,
    `original_yield: ${r.originalYield}`,
    r.prepTime ? `prep_time: ${r.prepTime}` : null,
    r.cookTime ? `cook_time: ${r.cookTime}` : null,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  const ingredientLines = r.ingredients.map(serializeIngredient).join('\n');
  const stepLines = r.steps.map((s, i) => `${i + 1}. ${serializeStep(s)}`).join('\n');

  return [
    fm,
    `# ${r.title}`,
    '## Ingredients',
    ingredientLines,
    '',
    '## Workflow',
    stepLines,
    '',
  ].join('\n');
}

function serializeIngredient(i: Ingredient): string {
  const tail = i.isLocked ? ' (LOCKED)' : '';
  return `- [ ] {${i.amount}|${i.unit}|${i.name}}${tail}`;
}

function serializeStep(s: WorkflowStep): string {
  const attrs: string[] = [];
  if (s.kind !== 'active') attrs.push(`kind="${s.kind}"`);
  if (s.thermalClass !== 'normal') attrs.push(`thermal="${s.thermalClass}"`);
  if (s.allergenClass !== 'allergen-free') attrs.push(`allergen="${s.allergenClass}"`);
  if (s.phase !== 'cook') attrs.push(`phase="${s.phase}"`);
  if (s.dependsOn.length > 0) attrs.push(`depends="${s.dependsOn.join(',')}"`);
  if (s.equipment && s.equipment.length > 0) attrs.push(`equipment="${s.equipment.join(',')}"`);
  if (s.batchKey) attrs.push(`batch="${s.batchKey}"`);
  if (s.panCapacityPortions) attrs.push(`pan-capacity="${s.panCapacityPortions}"`);

  if (attrs.length === 0) return s.text;
  return `<step ${attrs.join(' ')}>${s.text}</step>`;
}
