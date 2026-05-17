import { AlertTriangle, X } from 'lucide-react';
import { ALLERGEN_LABEL, ALLERGEN_TAGS } from '../../core/recipes/llm/allergens';
import type { AllergenTag, Ingredient } from '../../core/types';
import { randomId } from '../../core/util/id';

interface Props {
  index: number;
  value: Ingredient;
  onChange: (next: Ingredient) => void;
  onRemove: () => void;
  /** Effective allergens carried by this ingredient (user override OR auto-detection). */
  allergenMatches?: AllergenTag[];
}

const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'];
const VOLUME_UNITS = ['ml', 'L', 'tsp', 'tbsp', 'cup', 'fl oz', 'pt', 'qt', 'gal'];

export default function IngredientRow({ index, value, onChange, onRemove, allergenMatches }: Props) {
  function update<K extends keyof Ingredient>(key: K, v: Ingredient[K]) {
    const next = { ...value, [key]: v };
    next.raw = `{${next.amount}|${next.unit}|${next.name}}`;
    onChange(next);
  }

  const flags = allergenMatches ?? [];
  const hasAllergens = flags.length > 0;
  const availableToAdd = ALLERGEN_TAGS.filter((t) => !flags.includes(t));

  function setAllergenFlags(next: AllergenTag[] | undefined) {
    const nextIng: Ingredient = { ...value, allergenFlags: next };
    onChange(nextIng);
  }

  function clearAllFlags() {
    setAllergenFlags([]);
  }

  function removeFlag(tag: AllergenTag) {
    setAllergenFlags(flags.filter((t) => t !== tag));
  }

  function addFlag(tag: AllergenTag) {
    setAllergenFlags([...flags, tag]);
  }

  return (
    <li
      className={[
        'py-2 pl-2',
        hasAllergens ? 'border-l-2 border-red-500 bg-red-50/40 dark:bg-red-900/10' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm font-semibold w-6 pt-2">{index + 1}.</span>
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <input
            type="text"
            value={value.name}
            onChange={(e) => update('name', e.target.value)}
            className="input"
            aria-label="Ingredient name"
            placeholder="Ingredient"
          />
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
            {hasAllergens && (
              <button
                type="button"
                onClick={clearAllFlags}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
                aria-label="Clear all allergen flags on this ingredient"
                title="Mark this ingredient as allergen-free (override the auto-detection)"
              >
                clear all
              </button>
            )}
            {availableToAdd.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value as AllergenTag | '';
                  if (v) addFlag(v);
                }}
                className="text-xs rounded border border-slate-300 dark:border-slate-700
                           bg-transparent text-slate-600 dark:text-slate-400 px-1 py-0.5"
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
              className="input flex-1"
              aria-label="Amount"
            />
            <select
              value={value.unit}
              onChange={(e) => update('unit', e.target.value)}
              className="input flex-1"
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
          onClick={onRemove}
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
