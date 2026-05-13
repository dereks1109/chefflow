import ReactMarkdown from 'react-markdown';
import type { Recipe } from '../../core/types';
import { serializeRecipe } from '../../core/parser/serializeRecipe';

export default function MarkdownPreview({ recipe }: { recipe: Recipe }) {
  const md = serializeRecipe(recipe);
  return (
    <article
      className="prose prose-slate dark:prose-invert max-w-none
                 p-4 border border-slate-200 dark:border-slate-700 rounded-md
                 bg-slate-50 dark:bg-kitchen-ink overflow-auto"
      aria-label="Recipe preview"
    >
      <ReactMarkdown>{md}</ReactMarkdown>
      <details className="mt-4 text-xs text-slate-500">
        <summary>View raw markdown</summary>
        <pre className="whitespace-pre-wrap mt-2 text-xs">{md}</pre>
      </details>
    </article>
  );
}
