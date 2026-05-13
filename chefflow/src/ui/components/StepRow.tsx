import { useState } from 'react';
import type { WorkflowStep, ThermalClass, AllergenClass, StepKind, StepPhase } from '../../core/types';
import { randomId } from '../../core/util/id';

interface Props {
  index: number;
  value: WorkflowStep;
  earlierSteps: WorkflowStep[];
  onChange: (next: WorkflowStep) => void;
  onRemove: () => void;
}

const THERMAL: ThermalClass[] = ['normal', 'stable', 'flash'];
const PHASES: StepPhase[] = ['prep', 'cook', 'serve'];

export default function StepRow({ index, value, earlierSteps, onChange, onRemove }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function update<K extends keyof WorkflowStep>(key: K, v: WorkflowStep[K]) {
    onChange({ ...value, [key]: v });
  }

  function insertTimer() {
    const seconds = window.prompt('Timer length in seconds?', '300');
    if (!seconds || !/^\d+$/.test(seconds)) return;
    const tag = `<Timer duration="${seconds}s">${seconds}s</Timer>`;
    onChange({
      ...value,
      text: `${value.text} ${tag}`.trim(),
      durationSec: Number(seconds),
    });
  }

  return (
    <li className="border border-slate-200 dark:border-slate-700 rounded-md p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-sm font-semibold w-6 pt-2">{index + 1}.</span>
        <textarea
          value={value.text}
          onChange={(e) => update('text', e.target.value)}
          className="input flex-1 min-h-[3rem]"
          rows={2}
          aria-label={`Step ${index + 1} text`}
          placeholder="Describe this step…"
        />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <select
          value={value.kind}
          onChange={(e) => update('kind', e.target.value as StepKind)}
          className="input w-32"
          aria-label="Step kind"
        >
          <option value="active">Active</option>
          <option value="passive">Passive</option>
        </select>

        <button type="button" onClick={insertTimer} className="btn-secondary text-sm">
          ⏱ Add timer
        </button>

        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="btn-secondary text-sm"
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? 'Hide advanced' : 'Advanced'}
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="btn-danger text-sm ml-auto"
          aria-label={`Remove step ${index + 1}`}
        >
          Remove
        </button>
      </div>

      {advancedOpen && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <label className="text-sm">
            <span className="block mb-1">Thermal class</span>
            <select
              value={value.thermalClass}
              onChange={(e) => update('thermalClass', e.target.value as ThermalClass)}
              className="input"
            >
              {THERMAL.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block mb-1">Phase</span>
            <select
              value={value.phase}
              onChange={(e) => update('phase', e.target.value as StepPhase)}
              className="input"
            >
              {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block mb-1">Allergen</span>
            <select
              value={value.allergenClass}
              onChange={(e) => update('allergenClass', e.target.value as AllergenClass)}
              className="input"
            >
              <option value="allergen-free">allergen-free</option>
              <option value="allergen">allergen</option>
            </select>
          </label>
          <label className="text-sm md:col-span-3">
            <span className="block mb-1">Depends on</span>
            <select
              multiple
              value={value.dependsOn}
              onChange={(e) =>
                update(
                  'dependsOn',
                  Array.from(e.target.selectedOptions).map((o) => o.value)
                )
              }
              className="input h-24"
            >
              {earlierSteps.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {s.text.slice(0, 40) || s.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block mb-1">Batch key</span>
            <input
              type="text"
              value={value.batchKey ?? ''}
              onChange={(e) => update('batchKey', e.target.value || undefined)}
              className="input"
              placeholder="chop:onion"
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1">Pan capacity</span>
            <input
              type="number"
              min={1}
              value={value.panCapacityPortions ?? ''}
              onChange={(e) =>
                update('panCapacityPortions', e.target.value ? Number(e.target.value) : undefined)
              }
              className="input"
              placeholder="(none)"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="block mb-1">Equipment (comma-separated)</span>
            <input
              type="text"
              value={value.equipment?.join(', ') ?? ''}
              onChange={(e) =>
                update(
                  'equipment',
                  e.target.value ? e.target.value.split(',').map((s) => s.trim()) : undefined
                )
              }
              className="input"
              placeholder="oven@180C, wok"
            />
          </label>
        </div>
      )}
    </li>
  );
}

export function blankStep(): WorkflowStep {
  return {
    id: randomId(),
    text: '',
    kind: 'active',
    thermalClass: 'normal',
    allergenClass: 'allergen-free',
    dependsOn: [],
    phase: 'cook',
  };
}
