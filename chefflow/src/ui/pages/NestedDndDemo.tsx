import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import NestedDragDropBuilder, { type DndMilestone } from '../components/NestedDragDropBuilder';

const SAMPLE: DndMilestone[] = [
  {
    id: 'milestone-1',
    title: 'Milestone 1: Order and prep ingredients',
    steps: [
      { id: 'step-1', content: 'Diced onion' },
      { id: 'step-2', content: 'Chilli sliced' },
    ],
  },
  {
    id: 'milestone-2',
    title: 'Milestone 2: Cook dish A',
    steps: [
      { id: 'step-3', content: 'Sauté the onions until translucent' },
    ],
  },
  {
    id: 'milestone-3',
    title: 'Milestone 3: Plate & serve',
    steps: [],
  },
];

export default function NestedDndDemo() {
  const [snapshot, setSnapshot] = useState<DndMilestone[]>(SAMPLE);

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <Link to="/" className="btn-secondary text-sm inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Home
        </Link>
        <h1 className="text-2xl font-bold">Nested Drag &amp; Drop — Template</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Drag a milestone by its handle (⋮⋮) to reorder the top-level list. Drag a step by its handle to reorder it
          within a milestone, or drop it into a different milestone. Empty milestones still accept drops.
        </p>
      </header>

      <NestedDragDropBuilder initialMilestones={SAMPLE} onChange={setSnapshot} />

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">View current state as JSON</summary>
        <pre className="mt-2 p-3 rounded bg-slate-100 dark:bg-slate-900 overflow-auto">
{JSON.stringify(snapshot, null, 2)}
        </pre>
      </details>
    </section>
  );
}
