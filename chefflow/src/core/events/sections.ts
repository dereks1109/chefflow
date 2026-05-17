// ---------------------------------------------------------------------------
// Helpers for the user-defined section model on KitchenEvent.
//
// Sections are containers of dish IDs (see EventSection in core/types.ts).
// Dish itself stays section-agnostic — membership is computed by walking
// `event.sections[].dishIds` and bucketing any leftover dishes into
// "Unassigned".
// ---------------------------------------------------------------------------

import type { Dish, EventSection } from '../types';

export const UNASSIGNED_LABEL = 'Unassigned';

export interface DishGroup {
  /** Source section id; undefined for the synthetic "Unassigned" bucket. */
  sectionId?: string;
  label: string;
  dishes: Dish[];
}

/**
 * Group dishes for display. The "Unassigned" bucket comes first when non-empty;
 * sections then follow in the order the user arranged them. Each dish appears
 * in at most one bucket — if a dish id shows up in two sections (data drift)
 * the first section wins. Stale ids (referenced but not present in `dishes`)
 * are silently dropped.
 */
export function groupDishesBySections(
  dishes: readonly Dish[],
  sections: readonly EventSection[] | undefined,
): DishGroup[] {
  const dishMap = new Map<string, Dish>();
  for (const d of dishes) dishMap.set(d.id, d);

  const claimed = new Set<string>();
  const sectionGroups: DishGroup[] = [];
  if (sections) {
    for (const s of sections) {
      const list: Dish[] = [];
      for (const id of s.dishIds) {
        if (claimed.has(id)) continue;
        const dish = dishMap.get(id);
        if (!dish) continue;
        claimed.add(id);
        list.push(dish);
      }
      sectionGroups.push({ sectionId: s.id, label: s.name || 'Untitled section', dishes: list });
    }
  }

  const unassigned: Dish[] = [];
  for (const d of dishes) if (!claimed.has(d.id)) unassigned.push(d);

  const groups: DishGroup[] = [];
  if (unassigned.length > 0) {
    groups.push({ label: UNASSIGNED_LABEL, dishes: unassigned });
  }
  groups.push(...sectionGroups);
  return groups;
}

/**
 * Return new sections with `dishId` removed from wherever it currently lives.
 * Cheap to call on every drag — relies on reference equality of unchanged
 * sections so React sees minimal churn.
 */
export function removeDishFromAllSections(
  sections: readonly EventSection[] | undefined,
  dishId: string,
): EventSection[] {
  if (!sections) return [];
  return sections.map((s) =>
    s.dishIds.includes(dishId)
      ? { ...s, dishIds: s.dishIds.filter((id) => id !== dishId) }
      : s,
  );
}

/**
 * Insert `dishId` into `sectionId` at `index`. If `sectionId` is null, the
 * dish becomes unassigned (we just strip it from any section it was in).
 * Always strips the dishId from other sections first, so a single call covers
 * both "move within a section" and "move across sections".
 */
export function moveDishToSection(
  sections: readonly EventSection[] | undefined,
  dishId: string,
  destSectionId: string | null,
  destIndex: number,
): EventSection[] {
  const stripped = removeDishFromAllSections(sections, dishId);
  if (destSectionId === null) return stripped;
  return stripped.map((s) => {
    if (s.id !== destSectionId) return s;
    const nextIds = s.dishIds.slice();
    const clamped = Math.max(0, Math.min(destIndex, nextIds.length));
    nextIds.splice(clamped, 0, dishId);
    return { ...s, dishIds: nextIds };
  });
}
