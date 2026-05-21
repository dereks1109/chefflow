import { Link } from 'react-router-dom';
import { Heart, Download } from 'lucide-react';
import type { CommunityRecipeSummary } from '../../core/community/communityClient';

interface Props {
  recipe: CommunityRecipeSummary;
}

export default function CommunityRecipeCard({ recipe }: Props) {
  return (
    <article className="flex flex-col h-full border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-kitchen-ink">
      {recipe.coverPhoto ? (
        <Link to={`/community/${recipe.id}`} className="block">
          <img
            src={recipe.coverPhoto}
            alt={`${recipe.title || 'Recipe'} cover photo`}
            className="w-full aspect-video object-cover rounded-md mb-2"
            data-testid="community-card-cover-photo-img"
          />
        </Link>
      ) : (
        <Link
          to={`/community/${recipe.id}`}
          className="block w-full aspect-video rounded-md mb-2 bg-slate-100 dark:bg-surface-2"
          aria-label={`${recipe.title || 'Untitled'} — no cover photo`}
        />
      )}

      <header>
        <Link
          to={`/community/${recipe.id}`}
          className="text-sm font-semibold hover:text-accent line-clamp-2"
        >
          {recipe.title || 'Untitled recipe'}
        </Link>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
          by {recipe.authorDisplayName}
        </p>
      </header>

      <dl className="mt-2 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1" title={`${recipe.likes} likes`}>
          <Heart className="h-3.5 w-3.5" aria-hidden="true" />
          <dt className="sr-only">Likes</dt>
          <dd>{recipe.likes}</dd>
        </div>
        <div className="flex items-center gap-1" title={`${recipe.copies} copies`}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <dt className="sr-only">Copies</dt>
          <dd>{recipe.copies}</dd>
        </div>
      </dl>
    </article>
  );
}
