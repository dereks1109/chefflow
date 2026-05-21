import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, Layers, MoreVertical, Pin } from 'lucide-react';
import { AllergenPill, KeyTagPill } from './AllergenBadge';
import { formatGBP } from '../../core/util/money';
import { downscaleToDataUrl } from '../../core/util/image';
import type { Recipe } from '../../core/types';

const COVER_PHOTO_MAX_EDGE = 1600;

interface Props {
  recipe: Recipe;
  /** Number of OTHER recipes that reference this one via `#` (componentRecipeId).
   *  Drives a "used in N" badge so deleting a component is a visible decision. */
  usedByCount?: number;
  onTogglePin: (r: Recipe) => void;
  onDuplicate: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
  onCoverPhotoChange?: (next: string | undefined) => void;
}

function isDemo(recipe: Recipe): boolean {
  return recipe.id.startsWith('r_demo_');
}

export default function RecipeCard({
  recipe,
  usedByCount = 0,
  onTogglePin,
  onDuplicate,
  onDelete,
  onCoverPhotoChange,
}: Props) {
  const pinned = Boolean(recipe.isPinned);
  return (
    <article className="flex flex-col h-full border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-kitchen-ink">
      <div className="relative">
        {recipe.coverPhoto ? (
          <img
            src={recipe.coverPhoto}
            alt={`${recipe.title || 'Recipe'} cover photo`}
            className="w-full aspect-video object-cover rounded-md mb-2"
            data-testid="recipe-card-cover-photo-img"
          />
        ) : (
          <div
            className="w-full aspect-video rounded-md mb-2 bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
            data-testid="recipe-card-cover-placeholder"
            aria-hidden="true"
          >
            <ImageOff className="h-6 w-6 text-slate-300 dark:text-slate-600" />
          </div>
        )}
        {pinned && (
          <span
            data-testid="recipe-card-pinned-badge"
            aria-label="Pinned"
            className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent text-white text-[10px] font-semibold uppercase tracking-wide shadow-sm"
          >
            <Pin className="h-3 w-3" aria-hidden="true" />
            Pinned
          </span>
        )}
        {usedByCount > 0 && (
          <span
            data-testid="recipe-card-used-by-badge"
            aria-label={`Used by ${usedByCount} other recipe${usedByCount === 1 ? '' : 's'}`}
            title={`Referenced by ${usedByCount} other recipe${usedByCount === 1 ? '' : 's'} via #`}
            className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800/80 dark:bg-slate-900/80 text-white text-[10px] font-medium shadow-sm"
          >
            <Layers className="h-3 w-3" aria-hidden="true" />
            Used in {usedByCount}
          </span>
        )}
      </div>
      <header className="flex items-start justify-between gap-1.5">
        <Link
          to={`/recipes/${recipe.id}/edit`}
          className="text-sm font-semibold hover:text-accent flex-1 min-w-0 line-clamp-2"
        >
          {recipe.title || 'Untitled recipe'}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onTogglePin(recipe)}
            className={`h-7 w-7 inline-flex items-center justify-center rounded-md text-sm ${
              pinned
                ? 'bg-accent text-white'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
            aria-label={pinned ? 'Unpin recipe' : 'Pin recipe to top'}
            aria-pressed={pinned}
            title={pinned ? 'Pinned — click to unpin' : 'Pin to top'}
          >
            📌
          </button>
          <OverflowMenu
            recipe={recipe}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onCoverPhotoChange={onCoverPhotoChange}
          />
        </div>
      </header>
      <dl className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5">
        <div>
          <dt className="sr-only">Yield</dt>
          <dd>{recipe.originalYield} portion{recipe.originalYield === 1 ? '' : 's'}</dd>
        </div>
        {recipe.pricePerPortion !== undefined && (
          <div>
            <dt className="sr-only">Price per portion</dt>
            <dd>{formatGBP(recipe.pricePerPortion)}/portion</dd>
          </div>
        )}
      </dl>
      {recipe.analysis && <RecipeAnalysisRow analysis={recipe.analysis} />}
    </article>
  );
}

interface OverflowProps {
  recipe: Recipe;
  onDuplicate: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
  onCoverPhotoChange?: (next: string | undefined) => void;
}

function OverflowMenu({ recipe, onDuplicate, onDelete, onCoverPhotoChange }: OverflowProps) {
  const [open, setOpen] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasCover = Boolean(recipe.coverPhoto);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onCoverPhotoChange) return;
    try {
      const dataUrl = await downscaleToDataUrl(file, COVER_PHOTO_MAX_EDGE);
      onCoverPhotoChange(dataUrl);
      setCoverError(null);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Failed to read image');
    }
  }

  function triggerPicker() {
    setOpen(false);
    fileInputRef.current?.click();
  }

  function clearPhoto() {
    if (!onCoverPhotoChange) return;
    setOpen(false);
    setCoverError(null);
    onCoverPhotoChange(undefined);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        aria-label="Recipe actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {onCoverPhotoChange && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onPickFile(e)}
          data-testid="recipe-card-cover-input"
        />
      )}
      {coverError && (
        <p
          className="absolute right-0 top-8 z-10 min-w-[8rem] rounded-md border border-rose-200 dark:border-rose-700 bg-white dark:bg-surface-2 px-3 py-1.5 text-xs text-rose-600 dark:text-rose-400 shadow-md"
          role="alert"
        >
          {coverError}
        </p>
      )}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-8 z-10 min-w-[8rem] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-2 shadow-md py-1"
        >
          <Link
            to={`/recipes/${recipe.id}/edit`}
            role="menuitem"
            className="block px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-3"
            onClick={() => setOpen(false)}
          >
            Edit
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDuplicate(recipe);
            }}
            className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-3"
          >
            Duplicate
          </button>
          {onCoverPhotoChange && (
            <button
              type="button"
              role="menuitem"
              onClick={triggerPicker}
              data-testid="recipe-card-cover-pick"
              className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-3"
            >
              {hasCover ? 'Change photo' : 'Add photo'}
            </button>
          )}
          {onCoverPhotoChange && hasCover && (
            <button
              type="button"
              role="menuitem"
              onClick={clearPhoto}
              data-testid="recipe-card-cover-clear"
              className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-3"
            >
              Remove photo
            </button>
          )}
          {!isDemo(recipe) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete(recipe);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RecipeAnalysisRow({ analysis }: { analysis: NonNullable<Recipe['analysis']> }) {
  const keyTags = analysis.keyIngredientTags ?? [];
  const allergens = analysis.allergens ?? [];
  if (keyTags.length === 0 && allergens.length === 0) return null;
  return (
    <section className="mt-1.5 flex flex-wrap gap-1" aria-label="Recipe tags">
      {allergens.map((a) => (
        <AllergenPill key={a} tag={a} />
      ))}
      {keyTags.slice(0, 2).map((t) => (
        <KeyTagPill key={t}>{t}</KeyTagPill>
      ))}
    </section>
  );
}
