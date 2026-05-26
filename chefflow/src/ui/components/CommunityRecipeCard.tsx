import { Link } from 'react-router-dom';
import { Download, Heart, ImageOff } from 'lucide-react';
import { AllergenPill, KeyTagPill } from './AllergenBadge';
import { resolveCoverPhoto } from '../../core/demos/demoPhotoMap';
import type { CommunityRecipeSummary } from '../../core/community/communityClient';

interface Props {
  recipe: CommunityRecipeSummary;
}

// Mirrors the structure of RecipeCard (cover-photo block with ImageOff
// placeholder + line-clamp-2 title link + small footer metadata) so the
// recipes library and community library read as visual siblings. Kept
// view-only — no pin / duplicate / delete overflow menu, and no Pinned /
// "used in N" badges (those are intra-library concepts).
//
// Footer carries the community-specific signal: author + like count + copy
// count. Clicking title or cover navigates to /community/:id.
export default function CommunityRecipeCard({ recipe }: Props) {
  // Pipe through the demo photo map so the 15 canonical demo recipes show
  // their bundled JPEG when shared to community (the worker stores them
  // with empty coverPhoto to keep payloads small). The community id is
  // per-publication (e.g. `c_xyz`); demo lookup is keyed by sourceLocalId
  // (e.g. `r_demo_ribeye`), so prefer that when present.
  const coverSrc = resolveCoverPhoto({
    id: recipe.sourceLocalId ?? recipe.id,
    coverPhoto: recipe.coverPhoto,
  });
  return (
    <article className="flex flex-col h-full border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-kitchen-ink">
      <div className="relative">
        {coverSrc ? (
          <Link to={`/community/${recipe.id}`} className="block">
            <img
              src={coverSrc}
              alt={`${recipe.title || 'Recipe'} cover photo`}
              className="w-full aspect-video object-cover rounded-md mb-2"
              data-testid="community-card-cover-photo-img"
            />
          </Link>
        ) : (
          <Link
            to={`/community/${recipe.id}`}
            aria-label={`${recipe.title || 'Untitled'} — no cover photo`}
            className="block w-full aspect-video rounded-md mb-2 bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
            data-testid="community-card-cover-placeholder"
          >
            <ImageOff className="h-6 w-6 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          </Link>
        )}
      </div>

      <header className="flex-1 min-w-0">
        <Link
          to={`/community/${recipe.id}`}
          className="text-sm font-semibold hover:text-accent line-clamp-2"
        >
          {recipe.title || 'Untitled recipe'}
        </Link>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
          by{' '}
          {recipe.authorClerkId ? (
            <Link
              to={`/chef/${encodeURIComponent(recipe.authorClerkId)}`}
              className="hover:text-accent hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {recipe.authorDisplayName || 'anonymous'}
            </Link>
          ) : (
            recipe.authorDisplayName || 'anonymous'
          )}
        </p>
      </header>

      <dl className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
        {typeof recipe.originalYield === 'number' && (
          <div>
            <dt className="sr-only">Yield</dt>
            <dd>{recipe.originalYield} portion{recipe.originalYield === 1 ? '' : 's'}</dd>
          </div>
        )}
        <div className="flex items-center gap-1" title={`${recipe.likes} like${recipe.likes === 1 ? '' : 's'}`}>
          <Heart className="h-3.5 w-3.5" aria-hidden="true" />
          <dt className="sr-only">Likes</dt>
          <dd>{recipe.likes}</dd>
        </div>
        <div className="flex items-center gap-1" title={`${recipe.copies} ${recipe.copies === 1 ? 'copy' : 'copies'}`}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <dt className="sr-only">Copies</dt>
          <dd>{recipe.copies}</dd>
        </div>
      </dl>

      <CommunityCardTags tags={recipe.tags} />
    </article>
  );
}

function CommunityCardTags({ tags }: { tags?: CommunityRecipeSummary['tags'] }) {
  const allergens = tags?.allergens ?? [];
  const keyTags = tags?.keyIngredientTags ?? [];
  if (allergens.length === 0 && keyTags.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {allergens.map((a) => <AllergenPill key={`a-${a}`} tag={a} />)}
      {keyTags.map((t) => <KeyTagPill key={`k-${t}`}>{t}</KeyTagPill>)}
    </div>
  );
}
