import type { WorkflowStep } from '../../core/types';
import { randomId } from '../../core/util/id';

interface Props {
  index: number;
  value: WorkflowStep;
  onChange: (next: WorkflowStep) => void;
  onRemove: () => void;
}

export default function StepRow({ index, value, onChange, onRemove }: Props) {
  return (
    <li className="py-1">
      {/* T16 (d) — single-row textarea matching ingredient name input
          height (rows={1} + py-1.5, no min-h cap). Chefs can still drag
          the corner or type to scroll if the step is long; the default
          height stays uniform with the ingredient column on the left. */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold w-6 shrink-0">{index + 1}.</span>
        <textarea
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          className="input flex-1 text-sm py-1.5 resize-y"
          rows={1}
          aria-label={`Step ${index + 1} text`}
          placeholder="Describe this step…"
        />
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-lg bg-slate-100 dark:bg-slate-800 shrink-0 hover:bg-slate-200 dark:hover:bg-slate-700"
          aria-label={`Remove step ${index + 1}`}
        >
          ✕
        </button>
      </div>
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
