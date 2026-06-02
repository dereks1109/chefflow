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
      {/* T20 — rows={3} gives each step ~60px of typing room (~3 lines
          of text) so chefs can write a typical kitchen instruction
          without horizontal scroll. T17's items-stretch on the
          Ingredients+Steps grid keeps the columns aligned regardless.
          resize-y stays so the chef can drag for more room. */}
      <div className="flex items-start gap-2">
        <span className="text-sm font-semibold w-6 shrink-0 pt-1.5">{index + 1}.</span>
        <textarea
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          className="input flex-1 text-sm py-1.5 resize-y"
          rows={3}
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
