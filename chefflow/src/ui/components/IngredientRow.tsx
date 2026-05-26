import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ALLERGEN_LABEL, ALLERGEN_TAGS } from '../../core/recipes/llm/allergens';
import type { AllergenTag, Ingredient, Recipe } from '../../core/types';
import { randomId } from '../../core/util/id';
import { getRecipe } from '../../db/recipesRepo';
import RecipeAutocomplete from './RecipeAutocomplete';

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
  // Inherited tags from the linked sub-recipe (when this is a `#` ingredient).
  // Empty list when this isn't a sub-recipe link, or the sub-recipe has no
  // analysis yet. Read-only — chefs edit the sub-recipe to change them.
  const [inheritedAllergens, setInheritedAllergens] = useState<AllergenTag[]>([]);
  const [inheritedKeyTags, setInheritedKeyTags] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!value.componentRecipeId) {
      setInheritedAllergens([]);
      setInheritedKeyTags([]);
      return;
    }
    void getRecipe(value.componentRecipeId).then((sub) => {
      if (cancelled || !sub) return;
      setInheritedAllergens(sub.analysis?.allergens ?? []);
      setInheritedKeyTags(sub.analysis?.keyIngredientTags ?? []);
    });
    return () => { cancelled = true; };
  }, [value.componentRecipeId]);

  // The autocomplete is open whenever the name starts with `#` AND the user
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
  const hasAllergens = flags.length > 0;
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

  function addFlag(tag: AllergenTag) {
    setAllergenFlags([...flags, tag]);
  }

  function handleRemoveIngredient() {
    const label = value.name.trim() || `ingredient #${index + 1}`;
    if (!window.confirm(`Remove "${label}" from the recipe?`)) return;
    onRemove();
  }

  return (
    <li
      className={[
        'py-2 pl-2',
        hasAllergens ? 'border-l-2 border-red-500 bg-red-50/40 dark:bg-red-900/10' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm font-semibold w-6 pt-1.5">{index + 1}.</span>
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="relative">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={value.name}
                onChange={(e) => onNameChange(e.target.value)}
                onFocus={() => { if (hasLinkPrefix && !hasPickedRecipe) setAutocompleteOpen(true); }}
                className="input flex-1 min-w-0 text-sm py-1"
                aria-label="Ingredient name"
                placeholder="Ingredient  (type @ to link another recipe)"
              />
            </div>
            {showAutocomplete && (
              <RecipeAutocomplete
                query={autocompleteQuery}
                excludeRecipeId={currentRecipeId}
                onSelect={selectComponentRecipe}
                onClose={() => setAutocompleteOpen(false)}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1" aria-label="Ingredient allergens">
            {flags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-red-600
                           text-red-700 dark:text-red-300 dark:border-red-500 px-2 py-0.5 text-xs"
                title={`Contains: ${ALLERGEN_LABEL[tag]}`}
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {ALLERGEN_LABEL[tag]}
                <button
                  type="button"
                  onClick={() => removeFlag(tag)}
                  aria-label={`Remove ${ALLERGEN_LABEL[tag]} flag from this ingredient`}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            {/* Tags inherited from the linked sub-recipe (when `value` is a
                #-ingredient). Same pill markup as the editable allergen flags
                above, but READ-ONLY — no remove button, since chefs edit the
                source sub-recipe to change them. Key-ingredient tags use the
                neutral black-bordered pill from RecipeCard. */}
            {inheritedAllergens.map((tag) => (
              <span
                key={`inh-a-${tag}`}
                className="inline-flex items-center gap-1 rounded-full border border-red-600
                           text-red-700 dark:text-red-300 dark:border-red-500 px-2 py-0.5 text-xs"
                title={`Inherited from sub-recipe: ${ALLERGEN_LABEL[tag]}`}
                data-testid={`ingredient-inherited-allergen-${tag}`}
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {ALLERGEN_LABEL[tag]}
              </span>
            ))}
            {inheritedKeyTags.map((t) => (
              <span
                key={`inh-t-${t}`}
                className="inline-flex items-center rounded-full border border-slate-900 dark:border-slate-200
                           text-slate-900 dark:text-slate-200 px-2 py-0.5 text-xs"
                title="Inherited from sub-recipe"
                data-testid={`ingredient-inherited-key-${t}`}
              >
                {t}
              </span>
            ))}
            {availableToAdd.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value as AllergenTag | '';
                  if (v) addFlag(v);
                }}
                className="text-xs rounded border border-slate-300 dark:border-slate-700
                           bg-transparent text-slate-600 dark:text-slate-400 px-2 min-h-touch"
                aria-label="Flag an allergen on this ingredient"
              >
                <option value="">{hasAllergens ? '+ add allergen' : '+ flag allergen'}</option>
                {availableToAdd.map((t) => (
                  <option key={t} value={t}>{ALLERGEN_LABEL[t]}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              value={value.amount}
              onChange={(e) => update('amount', Number(e.target.value))}
              className="input flex-1 text-sm py-1"
              aria-label="Amount"
            />
            <select
              value={value.unit}
              onChange={(e) => update('unit', e.target.value)}
              className="input flex-1 text-sm py-1"
              aria-label="Unit"
            >
              <optgroup label="Weight">
                {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </optgroup>
              <optgroup label="Volume">
                {VOLUME_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </optgroup>
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRemoveIngredient}
          className="touch-target px-3 rounded-md text-lg bg-slate-100 dark:bg-slate-800 shrink-0 self-start"
          aria-label="Remove ingredient"
        >
          ✕
        </button>
      </div>
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
