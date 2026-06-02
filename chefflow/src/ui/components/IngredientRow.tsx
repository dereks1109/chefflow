import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X, Info } from 'lucide-react';
import { ALLERGEN_LABEL, ALLERGEN_TAGS } from '../../core/recipes/llm/allergens';
import { getRecipeAllergenList } from '../../core/recipes/recipeShape';
import type { AllergenTag, Ingredient, Recipe } from '../../core/types';
import { randomId } from '../../core/util/id';
import { getRecipe } from '../../db/recipesRepo';
import RecipeAutocomplete from './RecipeAutocomplete';
import AllergenAdditionModal from './AllergenAdditionModal';

interface Props {
  index: number;
  value: Ingredient;
  onChange: (next: Ingredient) => void;
  onRemove: () => void;
  /** Current recipe id (excluded from RecipeAutocomplete to prevent self-reference). */
  currentRecipeId?: string;
  /** Allergen tags the chef has flagged on this ingredient. ChefFlow no
   *  longer auto-detects allergens — this is purely user-declared data. */
  allergenMatches?: AllergenTag[];
}

const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'];
const VOLUME_UNITS = ['ml', 'L', 'tsp', 'tbsp', 'cup', 'fl oz', 'pt', 'qt', 'gal'];

export default function IngredientRow({ index, value, onChange, onRemove, currentRecipeId, allergenMatches }: Props) {
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  // Inherited allergens from the linked sub-recipe (when this is a `#`
  // ingredient). Empty list when this isn't a sub-recipe link. Read-only —
  // chefs edit the sub-recipe to change them. (keyIngredientTags
  // inheritance was dropped 2026-05-28 along with the feature.)
  const [inheritedAllergens, setInheritedAllergens] = useState<AllergenTag[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!value.componentRecipeId) {
      setInheritedAllergens([]);
      return;
    }
    void getRecipe(value.componentRecipeId).then((sub) => {
      if (cancelled || !sub) return;
      setInheritedAllergens(getRecipeAllergenList(sub));
    });
    return () => { cancelled = true; };
  }, [value.componentRecipeId]);

  // The autocomplete is open whenever the name starts with `@` AND the user
  // hasn't already picked a recipe (componentRecipeId set). After pick, the
  // user can re-trigger it by clearing the name back to an `@`-prefixed string.
  const hasLinkPrefix = value.name.startsWith('@');
  const hasPickedRecipe = Boolean(value.componentRecipeId);
  const showAutocomplete = autocompleteOpen && hasLinkPrefix && !hasPickedRecipe;
  const autocompleteQuery = hasLinkPrefix ? value.name.slice(1) : '';

  function update<K extends keyof Ingredient>(key: K, v: Ingredient[K]) {
    const next = { ...value, [key]: v };
    next.raw = `{${next.amount}|${next.unit}|${next.name}}`;
    onChange(next);
  }

  function onNameChange(nextName: string) {
    const startsWithAt = nextName.startsWith('@');
    // If user clears the leading `@`, also drop the componentRecipeId link.
    const next: Ingredient = startsWithAt
      ? { ...value, name: nextName }
      : { ...value, name: nextName, componentRecipeId: undefined };
    next.raw = `{${next.amount}|${next.unit}|${next.name}}`;
    onChange(next);
    if (startsWithAt && !value.componentRecipeId) setAutocompleteOpen(true);
  }

  function selectComponentRecipe(recipe: Recipe) {
    const nextName = `@${recipe.title}`;
    const next: Ingredient = {
      ...value,
      name: nextName,
      componentRecipeId: recipe.id,
      raw: `{${value.amount}|${value.unit}|${nextName}}`,
    };
    onChange(next);
    setAutocompleteOpen(false);
  }

  const flags = allergenMatches ?? [];
  const hasAllergens = flags.length > 0 || inheritedAllergens.length > 0;
  const availableToAdd = ALLERGEN_TAGS.filter((t) => !flags.includes(t));

  function setAllergenFlags(next: AllergenTag[] | undefined) {
    const nextIng: Ingredient = { ...value, allergenFlags: next };
    onChange(nextIng);
  }

  function removeFlag(tag: AllergenTag) {
    const label = ALLERGEN_LABEL[tag];
    if (!window.confirm(
      `Remove the "${label}" allergen flag from this ingredient?\n\n` +
      `Allergen flags are safety-critical. Only remove if you're certain this ingredient does not contain ${label}.`,
    )) return;
    setAllergenFlags(flags.filter((t) => t !== tag));
  }

  // Adding goes through a 5-second cooldown modal (mirror of the removal
  // gate — protects against a misclick on the picker silently adding a
  // false-positive allergen). The icon-button popover opens the modal;
  // the modal Confirm callback runs `commitAddFlag`.
  const [pendingAddTag, setPendingAddTag] = useState<AllergenTag | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Outside-click closes the allergen picker popover so the chef can
  // dismiss without taking an action.
  useEffect(() => {
    if (!pickerOpen) return;
    function onClick(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [pickerOpen]);

  function commitAddFlag() {
    if (!pendingAddTag) return;
    setAllergenFlags([...flags, pendingAddTag]);
    setPendingAddTag(null);
  }

  function handleRemoveIngredient() {
    const label = value.name.trim() || `ingredient #${index + 1}`;
    if (!window.confirm(`Remove "${label}" from the recipe?`)) return;
    onRemove();
  }

  return (
    <li
      className={[
        'py-1.5 pl-2',
        hasAllergens ? 'border-l-2 border-red-500 bg-red-50/40 dark:bg-red-900/10' : '',
      ].join(' ')}
    >
      {/* Top row — single horizontal line on desktop. Wraps on narrow
          viewports so the qty/unit drop under the name; the allergen
          icon + delete stay on the top line so the chef can act on the
          row without scrolling. */}
      <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
        <span className="text-sm font-semibold w-6 shrink-0 text-slate-500" aria-hidden="true">
          {index + 1}.
        </span>
        {/* T12 — allergen icon moved BEFORE the name input so it reads
            as a safety marker for the ingredient it qualifies, not a
            trailing action. The popover anchors `left-0` from this
            new position so it opens under the icon instead of off
            the right edge. Red ring when the row already carries
            allergen flags so the chef can scan the column visually. */}
        <div className="relative shrink-0" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            data-testid={`ingredient-allergen-button-${index}`}
            aria-label="Tag allergen on this ingredient"
            aria-expanded={pickerOpen}
            title="Tag allergen on this ingredient"
            className={[
              'inline-flex items-center justify-center h-8 w-8 rounded-md',
              'border border-slate-300 dark:border-slate-700',
              'hover:bg-red-50 dark:hover:bg-red-900/20',
              hasAllergens ? 'ring-2 ring-red-300 dark:ring-red-700 text-red-600 dark:text-red-400' : 'text-slate-500',
            ].join(' ')}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </button>
          {pickerOpen && (
            <div
              role="listbox"
              aria-label="Allergens"
              className="absolute z-20 left-0 mt-1 w-48 max-h-64 overflow-auto rounded-md
                         border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-kitchen-ink shadow-lg"
            >
              {availableToAdd.length === 0 ? (
                <p className="px-3 py-1.5 text-xs text-slate-500 italic">
                  All allergens already flagged.
                </p>
              ) : (
                availableToAdd.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setPendingAddTag(t); setPickerOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {ALLERGEN_LABEL[t]}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="relative flex-1 min-w-[10rem]">
          <input
            type="text"
            value={value.name}
            onChange={(e) => onNameChange(e.target.value)}
            onFocus={() => { if (hasLinkPrefix && !hasPickedRecipe) setAutocompleteOpen(true); }}
            className="input w-full text-sm py-1.5"
            aria-label="Ingredient name"
            placeholder="Ingredient (type @ to link another recipe)"
          />
          {showAutocomplete && (
            <RecipeAutocomplete
              query={autocompleteQuery}
              excludeRecipeId={currentRecipeId}
              onSelect={selectComponentRecipe}
              onClose={() => setAutocompleteOpen(false)}
            />
          )}
        </div>
        {/* T16 (d) — minimum-readable widths. amount w-12 (3rem = 48px)
            fits "999" with px-1.5 padding; unit w-14 (3.5rem = 56px)
            fits "tbsp" / "fl oz" with px-1.5 padding. */}
        <input
          type="number"
          step="any"
          value={value.amount}
          onChange={(e) => update('amount', Number(e.target.value))}
          className="input w-12 text-sm py-1.5 px-1.5 text-right shrink-0"
          aria-label="Amount"
        />
        <select
          value={value.unit}
          onChange={(e) => update('unit', e.target.value)}
          className="input w-14 text-sm py-1.5 px-1.5 shrink-0"
          aria-label="Unit"
        >
          <optgroup label="Weight">
            {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </optgroup>
          <optgroup label="Volume">
            {VOLUME_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </optgroup>
        </select>
        <button
          type="button"
          onClick={handleRemoveIngredient}
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-lg bg-slate-100 dark:bg-slate-800 shrink-0 hover:bg-slate-200 dark:hover:bg-slate-700"
          aria-label="Remove ingredient"
        >
          ✕
        </button>
      </div>

      {/* Allergen pill row — rendered ONLY when the ingredient has
          flagged or inherited allergens. Sits under the input row,
          tightly packed, so the chef can read the tags at a glance
          without consuming a third vertical row when no allergens
          are present. */}
      {(flags.length > 0 || inheritedAllergens.length > 0) && (
        <div className="mt-1.5 ml-16 flex flex-wrap items-center gap-1" aria-label="Ingredient allergens">
          {flags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 rounded-full border border-red-600
                         text-red-700 dark:text-red-300 dark:border-red-500 px-1.5 py-0 text-[10px]"
              title={`Contains: ${ALLERGEN_LABEL[tag]}`}
            >
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
              {ALLERGEN_LABEL[tag]}
              <button
                type="button"
                onClick={() => removeFlag(tag)}
                aria-label={`Remove ${ALLERGEN_LABEL[tag]} flag from this ingredient`}
                className="ml-0.5 opacity-60 hover:opacity-100"
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </span>
          ))}
          {inheritedAllergens.map((tag) => (
            <span
              key={`inh-a-${tag}`}
              className="inline-flex items-center gap-0.5 rounded-full border border-red-600
                         text-red-700 dark:text-red-300 dark:border-red-500 px-1.5 py-0 text-[10px]"
              title={`Inherited from sub-recipe: ${ALLERGEN_LABEL[tag]}`}
              data-testid={`ingredient-inherited-allergen-${tag}`}
            >
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
              {ALLERGEN_LABEL[tag]}
            </span>
          ))}
          {/* Belt-and-braces reminder that allergen tagging is the
              chef's responsibility, not ChefFlow's — surfacing the
              same framing here as the publish-time attestation modal
              means the chef sees it on every allergen-flagged row. */}
          <span
            data-testid={`ingredient-allergen-reminder-${index}`}
            tabIndex={0}
            aria-label="Allergen tagging is chef-declared — supplier labels are authoritative"
            title="Tag allergens you can confirm from the ingredient's label. ChefFlow does not detect allergens automatically. Supplier labels are authoritative."
            className="inline-flex items-center justify-center h-4 w-4 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-help focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <Info className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        </div>
      )}

      <AllergenAdditionModal
        open={pendingAddTag !== null}
        allergenLabel={pendingAddTag ? ALLERGEN_LABEL[pendingAddTag] : ''}
        ingredientName={value.name || `ingredient #${index + 1}`}
        onCancel={() => setPendingAddTag(null)}
        onConfirm={commitAddFlag}
      />
    </li>
  );
}

export function blankIngredient(): Ingredient {
  return {
    id: randomId(),
    raw: '{0|g|}',
    amount: 0,
    unit: 'g',
    name: '',
    isLocked: false,
  };
}
