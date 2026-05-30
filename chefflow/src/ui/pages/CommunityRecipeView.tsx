import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Heart, Download, ArrowLeft, Flag } from 'lucide-react';
import ReportRecipeDialog from '../components/ReportRecipeDialog';
import CommunityDisclaimerBanner from '../components/CommunityDisclaimerBanner';
import {
  getCommunityRecipe,
  getLiked,
  toggleLike,
  recordCopy,
  type CommunityRecipe,
} from '../../core/community/communityClient';
import { saveRecipe } from '../../db/recipesRepo';
import { randomId } from '../../core/util/id';
import { useAuthGate } from '../../state/useAuthGate';
import type { Recipe, Ingredient, WorkflowStep } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; recipe: CommunityRecipe; liked: boolean; copying: boolean };

export default function CommunityRecipeView() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const requireAuth = useAuthGate();
  const [reportOpen, setReportOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [recipe, liked] = await Promise.all([
          getCommunityRecipe(id),
          getLiked(id),
        ]);
        if (cancelled) return;
        if (!recipe) {
          setState({ kind: 'not-found' });
          return;
        }
        setState({ kind: 'ready', recipe, liked, copying: false });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load recipe';
        setState({ kind: 'error', message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleLike() {
    if (state.kind !== 'ready') return;
    const previous = state.recipe;
    try {
      const out = await toggleLike(previous.id);
      setState({
        kind: 'ready',
        recipe: { ...previous, likes: out.likes },
        liked: out.liked,
        copying: state.copying,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update like';
      setState({ kind: 'error', message });
    }
  }

  async function handleCopy() {
    if (state.kind !== 'ready') return;
    setState({ ...state, copying: true });
    try {
      // Snapshot the community recipe into the local Dexie store. New id and
      // timestamps so it lives as a fully independent recipe in the chef's
      // library. Title gets "(community)" suffix so it doesn't collide with
      // anything else they already have.
      const now = Date.now();
      const local: Recipe = {
        id: randomId(),
        title: `${state.recipe.title} (community)`,
        description: state.recipe.description,
        originalYield: state.recipe.originalYield,
        ingredients: (state.recipe.ingredients as Ingredient[]) ?? [],
        steps: (state.recipe.steps as WorkflowStep[]) ?? [],
        createdAt: now,
        updatedAt: now,
        coverPhoto: state.recipe.coverPhoto,
        analysis: state.recipe.analysis as Recipe['analysis'],
        // Anchor back to the community source so a later soft-delete fires
        // the uncopy webhook automatically (see recipesRepo.deleteRecipe).
        copiedFromCommunityId: state.recipe.id,
      };
      await saveRecipe(local);
      const out = await recordCopy(state.recipe.id);
      setState({
        kind: 'ready',
        recipe: { ...state.recipe, copies: out.copies },
        liked: state.liked,
        copying: false,
      });
      navigate(`/recipes/${local.id}/edit`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to copy recipe';
      setState({ kind: 'error', message });
    }
  }

  if (state.kind === 'loading') return <div className="p-6 text-slate-500">Loading…</div>;
  if (state.kind === 'not-found') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Recipe not found.</h1>
        <button type="button" onClick={() => navigate('/community')} className="btn-secondary mt-4">
          Back to community
        </button>
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Couldn’t load this recipe</h1>
        <p className="mt-2 text-rose-600 dark:text-rose-400" role="alert">{state.message}</p>
        <button type="button" onClick={() => navigate('/community')} className="btn-secondary mt-4">
          Back to community
        </button>
      </div>
    );
  }

  const r = state.recipe;
  const ingredients = (r.ingredients as Ingredient[]) ?? [];
  const steps = (r.steps as WorkflowStep[]) ?? [];
  const publishedDate = new Date(r.publishedAt).toLocaleDateString();

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto">
      <button
        type="button"
        onClick={() => navigate('/community')}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 mb-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to community
      </button>

      <CommunityDisclaimerBanner variant="full" />

      {r.coverPhoto && (
        <img
          src={r.coverPhoto}
          alt={`${r.title} cover photo`}
          className="w-full aspect-video object-cover rounded-md mb-4"
        />
      )}

      <header className="mb-4">
        <h1 className="text-2xl font-bold">{r.title || 'Untitled recipe'}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          by{' '}
          {r.authorClerkId ? (
            <Link
              to={`/chef/${encodeURIComponent(r.authorClerkId)}`}
              className="hover:text-accent hover:underline"
              data-testid="community-recipe-view-author-link"
            >
              {r.authorDisplayName}
            </Link>
          ) : (
            r.authorDisplayName
          )}
          {' '}— published {publishedDate}
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Yields {r.originalYield} portion{r.originalYield === 1 ? '' : 's'}
        </p>
        {r.description && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
            {r.description}
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => requireAuth(() => void handleLike())}
          aria-pressed={state.liked}
          className={[
            'inline-flex items-center gap-2 px-3 min-h-touch rounded-md text-sm font-medium border',
            state.liked
              ? 'bg-rose-500 text-white border-rose-500 hover:bg-rose-600'
              : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-3',
          ].join(' ')}
        >
          <Heart className="h-4 w-4" aria-hidden="true" fill={state.liked ? 'currentColor' : 'none'} />
          {state.liked ? 'Liked' : 'Like'} ({r.likes})
        </button>

        <button
          type="button"
          onClick={() => requireAuth(() => void handleCopy())}
          disabled={state.copying}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {state.copying ? 'Copying…' : `Copy to my library (${r.copies})`}
        </button>

        <button
          type="button"
          onClick={() => requireAuth(() => setReportOpen(true))}
          data-testid="community-report-button"
          className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400"
          title="Report this recipe"
        >
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
          Report
        </button>
      </div>

      {reportOpen && (
        <ReportRecipeDialog
          communityRecipeId={r.id}
          onClose={() => setReportOpen(false)}
        />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold mb-2">Ingredients</h2>
          {ingredients.length === 0 ? (
            <p className="text-sm text-slate-500">No ingredients listed.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {ingredients.map((ing) => (
                <li key={ing.id} className="border-b border-slate-100 dark:border-slate-800 py-1">
                  {ing.amount ? `${ing.amount} ${ing.unit ?? ''} ` : ''}
                  {ing.name || ing.raw}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Steps</h2>
          {steps.length === 0 ? (
            <p className="text-sm text-slate-500">No steps listed.</p>
          ) : (
            <ol className="space-y-2 text-sm list-decimal list-inside">
              {steps.map((s) => (
                <li key={s.id} className="leading-relaxed">{s.text}</li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}
