import type { Ingredient } from '../../core/types';
import { randomId } from '../../core/util/id';

interface Props {
  value: Ingredient;
  onChange: (next: Ingredient) => void;
  onRemove: () => void;
}

const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'];
const VOLUME_UNITS = ['ml', 'L', 'tsp', 'tbsp', 'cup', 'fl oz', 'pt', 'qt', 'gal'];

export default function IngredientRow({ value, onChange, onRemove }: Props) {
  function update<K extends keyof Ingredient>(key: K, v: Ingredient[K]) {
    const next = { ...value, [key]: v };
    next.raw = `{${next.amount}|${next.unit}|${next.name}}`;
    onChange(next);
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <input
        type="number"
        step="any"
        value={value.amount}
        onChange={(e) => update('amount', Number(e.target.value))}
        className="input w-24"
        aria-label="Amount"
      />
      <select
        value={value.unit}
        onChange={(e) => update('unit', e.target.value)}
        className="input w-28"
        aria-label="Unit"
      >
        <optgroup label="Weight">
          {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </optgroup>
        <optgroup label="Volume">
          {VOLUME_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </optgroup>
      </select>
      <input
        type="text"
        value={value.name}
        onChange={(e) => update('name', e.target.value)}
        className="input flex-1 min-w-[10rem]"
        aria-label="Ingredient name"
        placeholder="Ingredient"
      />
      <button
        type="button"
        onClick={() => update('isLocked', !value.isLocked)}
        className={`touch-target px-3 rounded-md text-lg ${value.isLocked ? 'bg-accent text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
        aria-label={value.isLocked ? 'Unlock ingredient (will scale)' : 'Lock ingredient (no scaling)'}
        title={value.isLocked ? 'Locked — will not scale' : 'Unlocked — scales with portions'}
      >
        {value.isLocked ? '🔒' : '🔓'}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="touch-target px-3 rounded-md text-lg bg-slate-100 dark:bg-slate-800"
        aria-label="Remove ingredient"
      >
        ✕
      </button>
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
