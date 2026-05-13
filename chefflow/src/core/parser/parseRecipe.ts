import matter from 'gray-matter';
import type { Recipe, Ingredient, WorkflowStep } from '../types';
import { randomId } from '../util/id';

export function parseRecipe(md: string): Recipe {
  const { data, content } = matter(md);
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled Recipe';

  return {
    id: String(data.recipe_id ?? randomId()),
    title,
    originalYield: Number(data.original_yield ?? 1),
    prepTime: data.prep_time ? String(data.prep_time) : undefined,
    cookTime: data.cook_time ? String(data.cook_time) : undefined,
    ingredients: parseIngredients(content),
    steps: parseSteps(content),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const INGREDIENT_REGEX =
  /^\s*-\s*\[\s*\]\s*\{(?<amount>[^|]+)\|(?<unit>[^|]+)\|(?<name>[^}]+)\}(?<locked>\s*\(LOCKED\))?\s*$/gm;

function parseIngredients(content: string): Ingredient[] {
  const ingredients: Ingredient[] = [];
  // Reset regex state since /g is stateful.
  INGREDIENT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = INGREDIENT_REGEX.exec(content)) !== null) {
    const g = match.groups!;
    const raw = `{${g.amount}|${g.unit}|${g.name}}`;
    index += 1;
    ingredients.push({
      id: `i${index}`,
      raw,
      amount: Number(g.amount),
      unit: g.unit.trim(),
      name: g.name.trim(),
      isLocked: Boolean(g.locked),
    });
  }
  return ingredients;
}

const STEP_LINE_REGEX = /^(?:\d+)\.\s+(.+?)$/gm;
const STEP_TAG_REGEX =
  /^<step(?<attrs>\s+[^>]*)?>(?<body>[\s\S]*?)<\/step>$/i;
const TIMER_REGEX = /<Timer\s+duration="(?<dur>\d+)s">/i;

function parseSteps(content: string): WorkflowStep[] {
  // Take only the "Workflow" section if present; otherwise scan whole content.
  const workflowSection = extractSection(content, 'Workflow') ?? content;
  const steps: WorkflowStep[] = [];
  STEP_LINE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = STEP_LINE_REGEX.exec(workflowSection)) !== null) {
    index += 1;
    const lineBody = match[1].trim();
    const { attrs, body } = unwrapStepTag(lineBody);
    const timer = body.match(TIMER_REGEX);
    steps.push({
      id: attrs.id ?? `s${index}`,
      text: body,
      durationSec: timer ? Number(timer.groups!.dur) : undefined,
      kind: (attrs.kind as 'active' | 'passive') ?? 'active',
      equipment: attrs.equipment ? attrs.equipment.split(',').map(s => s.trim()) : undefined,
      thermalClass: (attrs.thermal as 'flash' | 'stable' | 'normal') ?? 'normal',
      allergenClass: (attrs.allergen as 'allergen-free' | 'allergen') ?? 'allergen-free',
      dependsOn: attrs.depends ? attrs.depends.split(',').map(s => s.trim()) : [],
      batchKey: attrs.batch,
      panCapacityPortions: attrs['pan-capacity'] ? Number(attrs['pan-capacity']) : undefined,
      phase: (attrs.phase as 'prep' | 'cook' | 'serve') ?? 'cook',
    });
  }
  return steps;
}

function unwrapStepTag(line: string): { attrs: Record<string, string>; body: string } {
  const m = line.match(STEP_TAG_REGEX);
  if (!m) return { attrs: {}, body: line };
  return { attrs: parseAttrs(m.groups?.attrs ?? ''), body: m.groups!.body.trim() };
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w[\w-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

function extractSection(content: string, name: string): string | null {
  const re = new RegExp(`##\\s+${name}\\b[\\s\\S]*?(?=\\n##\\s|\\s*$)`);
  const m = content.match(re);
  return m ? m[0] : null;
}

