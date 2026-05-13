import type { Ingredient } from '../../core/types';
import { randomId } from '../../core/util/id';

interface Props {
  index: number;
  value: Ingredient;
  onChange: (next: Ingredient) => void;
  onRemove: () => void;
}

const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'];
const VOLUME_UNITS = ['ml', 'L', 'tsp', 'tbsp', 'cup', 'fl oz', 'pt', 'qt', 'gal'];

export default function IngredientRow({ index, value, onChange, onRemove }: Props) {
  function update<K extends keyof Ingredient>(key: K, v: Ingredient[K]) {
    const next = { ...value, [key]: v };
    next.raw = `{${next.amount}|${next.unit}|${next.name}}`;
    onChange(next);
  }

  return (
    <li className="py-2">
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
