import { useEffect, useState } from 'react';
import { Globe2 } from 'lucide-react';
import CommunityRecipeCard from '../components/CommunityRecipeCard';
import CommunityDisclaimerBanner from '../components/CommunityDisclaimerBanner';
import {
  listCommunityRecipes,
  type CommunityRecipeSummary,
} from '../../core/community/communityClient';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: CommunityRecipeSummary[] };

// Translate the raw fetch / worker error into copy a chef can act on.
// Reddit feedback (Jun 2026): Safari's native "Load failed" leaked
// through verbatim, reading as a bug instead of a transient network
// blip. Pair categories with the worker's structured 503 so the chef
// knows whether to retry or report.
export function friendlyCommunityError(raw: string): string {
  if (/load failed|failed to fetch|networkerror/i.test(raw)) {
    return "Couldn't reach the community feed. Check your connection and try again.";
  }
  if (/community worker 5\d\d/i.test(raw)) {
    return 'Community feed is temporarily unavailable. Please try again in a moment.';
  }
  return 'Something went wrong loading the community feed.';
}

export default function CommunityLibrary() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Bumping `generation` re-fires the useEffect — the Retry button uses
  // this instead of duplicating the fetch + cancellation pattern inline.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    listCommunityRecipes()
      .then((items) => {
        if (!cancelled) setState({ kind: 'ready', items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load community recipes';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  if (state.kind === 'loading') {
    return <div className="p-6 text-slate-500">Loading community…</div>;
  }

  if (state.kind === 'error') {
    return (
      <section className="p-6 max-w-md mx-auto text-center">
        <h1 className="text-xl font-bold">Community</h1>
        <p className="mt-2 text-rose-600 dark:text-rose-400" role="alert">
          {friendlyCommunityError(state.message)}
        </p>
        <button
          type="button"
          onClick={() => setGeneration((g) => g + 1)}
          className="btn-secondary mt-4"
          data-testid="community-retry"
        >
          Try again
        </button>
      </section>
    );
  }

  if (state.items.length === 0) {
    return (
      <section className="p-6 text-center max-w-md mx-auto">
        <Globe2 className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold mt-4">Community</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          No shared recipes yet. Publish one of yours from the recipe editor.
        </p>
      </section>
    );
  }

  return (
    <section className="p-4 md:p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-3 gap-2">
        <h1 className="text-2xl font-bold">Community</h1>
      </header>
      <CommunityDisclaimerBanner variant="compact" />
      <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        {state.items.map((r) => (
          <li key={r.id} className="h-full">
            <CommunityRecipeCard recipe={r} />
          </li>
        ))}
      </ul>
    </section>
  );
}
