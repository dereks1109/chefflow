import type { WorkflowStep } from '../types';

// Tiny predicates so call sites read like CulinaryRule.md prose.
export const isFlash = (s: WorkflowStep): boolean => s.thermalClass === 'flash';
export const isStable = (s: WorkflowStep): boolean => s.thermalClass === 'stable';
export const isAllergen = (s: WorkflowStep): boolean => s.allergenClass === 'allergen';
export const isAllergenFree = (s: WorkflowStep): boolean => s.allergenClass === 'allergen-free';

/** True when both steps name the same batchKey (and the key is non-empty). */
export function sameBatchKey(a: WorkflowStep, b: WorkflowStep): boolean {
  return Boolean(a.batchKey) && a.batchKey === b.batchKey;
}

/**
 * Topologically sort a step list by dependsOn. The input order is preserved
 * as a stable tie-breaker so the algorithm reads top-to-bottom of the recipe
 * when there are no real dependencies.
 *
 * Returns a tuple of [sorted, cycleNodeIds]. If a cycle is detected, the
 * involved node ids are returned so the caller can emit a warning and fall
 * back to the original order at those nodes.
 */
export function topologicalSort(steps: WorkflowStep[]): {
  sorted: WorkflowStep[];
  cycleNodeIds: string[];
} {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();  // id -> ids depending on it
  for (const s of steps) {
    indegree.set(s.id, 0);
    dependents.set(s.id, []);
  }
  for (const s of steps) {
    for (const dep of s.dependsOn) {
      if (!byId.has(dep)) continue;
      indegree.set(s.id, (indegree.get(s.id) ?? 0) + 1);
      dependents.get(dep)!.push(s.id);
    }
  }

  // Process in input order so siblings retain recipe ordering.
  const ready: string[] = [];
  for (const s of steps) {
    if ((indegree.get(s.id) ?? 0) === 0) ready.push(s.id);
  }

  const sorted: WorkflowStep[] = [];
  const visited = new Set<string>();
  while (ready.length > 0) {
    const id = ready.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    sorted.push(byId.get(id)!);
    for (const child of dependents.get(id) ?? []) {
      indegree.set(child, (indegree.get(child) ?? 0) - 1);
      if ((indegree.get(child) ?? 0) === 0) ready.push(child);
    }
  }

  const cycleNodeIds = steps.filter((s) => !visited.has(s.id)).map((s) => s.id);
  if (cycleNodeIds.length > 0) {
    // Append remaining (cycle) nodes in original order so the caller still
    // gets a complete list — the warning surfaces the bug.
    for (const s of steps) {
      if (!visited.has(s.id)) sorted.push(s);
    }
  }
  return { sorted, cycleNodeIds };
}
