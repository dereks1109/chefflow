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
    <li className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
      <div className="flex items-start gap-2">
        <span className="text-sm font-semibold w-6 pt-2">{index + 1}.</span>
        <textarea
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          className="input flex-1 min-h-[3rem]"
          rows={2}
          aria-label={`Step ${index + 1} text`}
          placeholder="Describe this step…"
        />
        <button
          type="button"
          onClick={onRemove}
          className="touch-target px-3 rounded-md text-lg bg-slate-100 dark:bg-slate-800 self-start"
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
