import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChefHat } from 'lucide-react';
import CommunityRecipeCard from '../components/CommunityRecipeCard';
import {
  listCommunityRecipesByAuthor,
  type CommunityRecipeSummary,
} from '../../core/community/communityClient';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: CommunityRecipeSummary[] };

export default function ChefProfile() {
  const { clerkId = '' } = useParams<{ clerkId: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listCommunityRecipesByAuthor(clerkId)
      .then((items) => {
        if (!cancelled) setState({ kind: 'ready', items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load profile';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [clerkId]);

  if (state.kind === 'loading') {
    return <div className="p-6 text-slate-500">Loading chef profile…</div>;
  }

  if (state.kind === 'error') {
    return (
      <section className="p-6 max-w-md mx-auto text-center">
        <h1 className="text-xl font-bold">Chef profile</h1>
        <p className="mt-2 text-rose-600 dark:text-rose-400" role="alert">{state.message}</p>
        <Link to="/community" className="btn-secondary mt-4 inline-flex">Back to community</Link>
      </section>
    );
  }

  const authorName = state.items[0]?.authorDisplayName ?? 'This chef';
  const hasRecipes = state.items.length > 0;

  return (
    <section className="p-4 md:p-6 max-w-5xl mx-auto">
      <Link
        to="/community"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 mb-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to community
      </Link>

      <header className="flex items-center gap-3 mb-6">
        <span className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-accent/15 text-accent">
          <ChefHat className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold" data-testid="chef-profile-name">{authorName}</h1>
          <p className="text-sm text-slate-500">
            {hasRecipes
              ? `${state.items.length} published recipe${state.items.length === 1 ? '' : 's'}`
              : 'No published recipes yet.'}
          </p>
        </div>
      </header>

      {hasRecipes && (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
          {state.items.map((r) => (
            <li key={r.id} className="h-full">
              <CommunityRecipeCard recipe={r} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
