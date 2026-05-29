import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ImageOff, Sparkles, X } from 'lucide-react';
import { downscaleToDataUrl } from '../../core/util/image';
import IngredientRow, { blankIngredient } from '../components/IngredientRow';
import StepRow, { blankStep } from '../components/StepRow';
import TimePicker from '../components/TimePicker';
import AllergensSection from '../components/AllergensSection';
import CalorieAnalysisSection from '../components/CalorieAnalysisSection';
import AllergenHistorySection from '../components/AllergenHistorySection';
import SubRecipeStepsPanel from '../components/SubRecipeStepsPanel';
import { getRecipe, saveRecipe } from '../../db/recipesRepo';
import {
  isAllergenTag,
  applyRecipeAllergenAdd,
  applyRecipeAllergenRemove,
  applyIngredientAllergenAdd,
  applyIngredientAllergenRemove,
} from '../../core/recipes/llm/allergens';
import { loadReviewDraft } from '../../core/events/reviewDraft';
import { publishRecipe, unpublishRecipe } from '../../core/community/communityClient';
import { generateDescription } from '../../core/recipes/llm/descriptionGen';
import { LlmDailyQuotaExceededError } from '../../core/llm/llmClient';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { getRecipeAllergens } from '../../core/recipes/llm/allergens';
import AllergenAttestationModal from '../components/AllergenAttestationModal';
import RecipeSaveAttestationModal from '../components/RecipeSaveAttestationModal';
import PinGate from '../components/PinGate';
import { useSessionAttestationStore } from '../../state/useSessionAttestationStore';
import { usePublishedSet } from '../../state/usePublishedSet';
import { useProfileStore } from '../../state/useProfileStore';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';
import { useAuthGate } from '../../state/useAuthGate';
import type { AllergenTag, Recipe, Ingredient, WorkflowStep } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; recipe: Recipe };

export default function RecipeEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const requireAuth = useAuthGate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dirty, setDirty] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [descBusy, setDescBusy] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [attestOpen, setAttestOpen] = useState(false);
  const [saveAttestOpen, setSaveAttestOpen] = useState(false);
  const displayName = useProfileStore((s) => s.displayName);
  const showNameOnCommunity = useProfileStore((s) => s.showNameOnCommunity);
  const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
  const model = useLlmSettingsStore((s) => s.model);
  // Mirror the resolution in AnalysisSection.tsx + Workflow.tsx so the AI
  // description button is gated consistently across the app. Proxy mode
  // routes through the worker (no per-user key required); groq mode falls
  // back to env vars + the stored API key from Settings.
  const isProxyMode = (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy';
  const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
  const apiKey = isProxyMode ? 'proxy' : (storedApiKey || envApiKey).trim();
  const hasLlmAccess = isProxyMode || apiKey.length > 0;
  const communityId = usePublishedSet((s) => s.map[id]);
  const linkPublished = usePublishedSet((s) => s.link);
  const unlinkPublished = usePublishedSet((s) => s.unlink);

  useEffect(() => {
    let cancelled = false;
    getRecipe(id).then((recipe) => {
      if (cancelled) return;
      if (!recipe) {
        setState({ kind: 'not-found' });
      } else {
        setState({ kind: 'ready', recipe });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === 'loading') return <div className="p-6 text-slate-500">Loading…</div>;
  if (state.kind === 'not-found') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Recipe not found.</h1>
        <button type="button" onClick={() => navigate('/recipes')} className="btn-secondary mt-4">
          Back to library
        </button>
      </div>
    );
  }

  const r = state.recipe;

  function update<K extends keyof Recipe>(key: K, value: Recipe[K]) {
    setState({ kind: 'ready', recipe: { ...r, [key]: value } });
    setDirty(true);
  }

  function commitRecipe(nextRecipe: Recipe) {
    setState({ kind: 'ready', recipe: nextRecipe });
    setDirty(true);
  }

  function updateIngredient(idx: number, next: Ingredient) {
    const prev = r.ingredients[idx];
    const nextList = r.ingredients.slice();
    nextList[idx] = next;
    let working: Recipe = { ...r, ingredients: nextList };

    // Diff the ingredient's allergenFlags and cascade each delta through the
    // applyIngredient* helpers so analysis.allergens stays in sync. Other
    // ingredient-field edits (name, amount, unit, etc.) are already in
    // `working` and survive untouched.
    const prevFlags = new Set<AllergenTag>(
      (prev?.allergenFlags ?? []).filter(isAllergenTag),
    );
    const nextFlags = new Set<AllergenTag>(
      (next.allergenFlags ?? []).filter(isAllergenTag),
    );
    for (const tag of nextFlags) {
      if (!prevFlags.has(tag)) working = applyIngredientAllergenAdd(working, next.id, tag);
    }
    for (const tag of prevFlags) {
      if (!nextFlags.has(tag)) working = applyIngredientAllergenRemove(working, next.id, tag);
    }
    commitRecipe(working);
  }

  function addIngredient() {
    update('ingredients', [...r.ingredients, blankIngredient()]);
  }

  function removeIngredient(idx: number) {
    update('ingredients', r.ingredients.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, next: WorkflowStep) {
    const nextList = r.steps.slice();
    nextList[idx] = next;
    update('steps', nextList);
  }

  function addStep() {
    update('steps', [...r.steps, blankStep()]);
  }

  function removeStep(idx: number) {
    update('steps', r.steps.filter((_, i) => i !== idx));
  }

  function updateRecipeFromSection(next: Recipe) {
    // AnalysisSection now emits the full Recipe with top-level
    // allergens / keyIngredientTags already updated (2026-05-27). Diff
    // recipe-level allergens here so a chef-typed allergen still cascades
    // to matching ingredient rows via the mutation helpers — the cascade
    // is a parent-side concern because the section can't see which
    // ingredients to mirror onto.
    const prevAllergens = new Set<AllergenTag>(
      (r.allergens ?? r.analysis?.allergens ?? []).filter(isAllergenTag),
    );
    const nextAllergens = new Set<AllergenTag>(
      (next.allergens ?? []).filter(isAllergenTag),
    );
    let working: Recipe = next;
    for (const tag of nextAllergens) {
      if (!prevAllergens.has(tag)) working = applyRecipeAllergenAdd(working, tag);
    }
    for (const tag of prevAllergens) {
      if (!nextAllergens.has(tag)) working = applyRecipeAllergenRemove(working, tag);
    }
    commitRecipe(working);
  }

  // If the chef arrived here from the New-Event review flow ("Create new
  // recipe" on an unmatched dish), there's a draft in sessionStorage tagged
  // with this recipe's id. Routing back to /events makes EventsLibrary
  // rehydrate the review sheet with the freshly-saved stub already linked.
  function returnRoute(): string {
    const draft = loadReviewDraft();
    return draft?.awaitingRecipeId === r.id ? '/events' : '/recipes';
  }

  async function handleSave() {
    // Session-scoped hygiene-attestation gate: ensure the chef has seen
    // the "ChefFlow is not a hygiene-certification service" framing at
    // least once per browser session. Subsequent saves in the same
    // session skip the modal and save directly. A refresh / sign-out
    // re-arms the gate by resetting the (non-persisted) Zustand store.
    if (!useSessionAttestationStore.getState().recipeSaveAttested) {
      setSaveAttestOpen(true);
      return;
    }
    await actualSave();
  }

  async function actualSave() {
    const nextRecipe: Recipe = { ...r, updatedAt: Date.now() };
    await saveRecipe(nextRecipe);
    setDirty(false);
    // Auto-republish to community if this recipe is currently in the
    // publishedSet. Worker treats author+sourceLocalId as the update key,
    // so likes + copies counters survive. Fire-and-forget — silent log on
    // failure; the local save still succeeds even if the worker is down.
    if (communityId) {
      const nameToSend = showNameOnCommunity ? displayName : '';
      void publishRecipe(nextRecipe, nameToSend).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[RecipeEditor] auto-republish failed', err);
      });
    }
    navigate(returnRoute());
  }

  function handleCancel() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    navigate(returnRoute());
  }

  // First-publish allergen attestation: open the modal, real publish runs
  // on the modal's onConfirm. Re-publishes (the auto-republish in
  // handleSave) skip the modal because the user already attested once
  // when they first published — the recipe is in usePublishedSet.
  function handlePublish() {
    setShareError(null);
    setAttestOpen(true);
  }

  async function doPublish() {
    setShareBusy(true);
    try {
      const nameToSend = showNameOnCommunity ? displayName : '';
      const { id: newCommunityId } = await publishRecipe(r, nameToSend);
      linkPublished(r.id, newCommunityId);
      setAttestOpen(false);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setShareBusy(false);
    }
  }

  async function handleGenerateDescription() {
    if (r.description && r.description.trim().length > 0) {
      if (!window.confirm('Replace existing description?')) return;
    }
    setDescError(null);
    setDescBusy(true);
    try {
      const next = await generateDescription({ recipe: r, apiKey, model });
      update('description', next);
    } catch (err) {
      if (err instanceof LlmDailyQuotaExceededError) {
        useUpgradeSheetStore.getState().openWith('llm');
        return;
      }
      setDescError(err instanceof Error ? err.message : 'Failed to generate description');
    } finally {
      setDescBusy(false);
    }
  }

  async function handleUnpublish() {
    if (!communityId) return;
    if (!window.confirm('Unpublish this recipe from the community?')) return;
    setShareError(null);
    setShareBusy(true);
    try {
      await unpublishRecipe(communityId);
      unlinkPublished(r.id);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to unpublish');
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <PinGate>
      {attestOpen && (
        <AllergenAttestationModal
          allergens={getRecipeAllergens(r) as string[]}
          submitting={shareBusy}
          onCancel={() => setAttestOpen(false)}
          onConfirm={() => void doPublish()}
        />
      )}
      <RecipeSaveAttestationModal
        open={saveAttestOpen}
        onCancel={() => setSaveAttestOpen(false)}
        onConfirm={() => {
          useSessionAttestationStore.getState().setRecipeSaveAttested(true);
          setSaveAttestOpen(false);
          void actualSave();
        }}
      />

      {/* Sticky toolbar — back link + live title + save reachable always.
          Replaces the prior in-page header that scrolled away on long
          recipes. Live recipe title doubles as orientation. */}
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-kitchen-ink/95 backdrop-blur border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-2 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleCancel}
              aria-label="Back to recipes"
              className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 p-1 rounded"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <h1 className="text-base font-semibold truncate" title={r.title || 'Untitled recipe'}>
              {r.title || 'Untitled recipe'}
            </h1>
            {dirty && (
              <span className="text-[11px] text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30">
                Unsaved
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {communityId ? (
              <>
                <span
                  className="hidden sm:inline text-xs px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  data-testid="recipe-editor-published-badge"
                >
                  Published
                </span>
                <button
                  type="button"
                  onClick={() => requireAuth(() => void handleUnpublish())}
                  disabled={shareBusy}
                  className="btn-secondary text-sm disabled:opacity-60"
                  data-testid="recipe-editor-unpublish-btn"
                >
                  Unpublish
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => requireAuth(() => void handlePublish())}
                disabled={shareBusy}
                className="btn-secondary text-sm disabled:opacity-60"
                data-testid="recipe-editor-publish-btn"
              >
                {shareBusy ? 'Publishing…' : 'Share publicly'}
              </button>
            )}
            <button type="button" onClick={handleCancel} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              data-testid="recipe-editor-save"
              className="btn-primary text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <section className="p-4 md:p-6 max-w-7xl mx-auto">
        {shareError && (
          <p className="mb-3 text-sm text-rose-600 dark:text-rose-400" role="alert">
            {shareError}
          </p>
        )}

        <form className="grid gap-6 md:grid-cols-[300px_1fr] items-start" onSubmit={(e) => e.preventDefault()}>
          {/* SIDEBAR — metadata + cover + safety-critical fields. On
              md+ it sticks under the toolbar so it stays visible
              while the chef scrolls a long ingredient/step list. */}
          <aside className="space-y-4 md:sticky md:top-14 md:self-start">
            <CoverPhotoControl
              coverPhoto={r.coverPhoto}
              onChange={(next) => update('coverPhoto', next)}
            />

            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name of dish</span>
              <input
                type="text"
                value={r.title}
                onChange={(e) => update('title', e.target.value)}
                className="input mt-1 text-sm"
                data-testid="recipe-editor-title-input"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</span>
              <div className="relative mt-1">
                <textarea
                  value={r.description ?? ''}
                  onChange={(e) => update('description', e.target.value || undefined)}
                  rows={3}
                  placeholder="Short description of the dish (optional)"
                  className="input resize-y pr-10 text-sm"
                  data-testid="recipe-editor-description-input"
                />
                <button
                  type="button"
                  onClick={() => requireAuth(() => void handleGenerateDescription())}
                  disabled={descBusy || !hasLlmAccess}
                  aria-label="Generate description with AI"
                  title={hasLlmAccess ? 'Generate with AI' : 'Connect Groq in Settings to enable AI features'}
                  data-testid="recipe-editor-description-ai"
                  className="absolute top-2 right-2 p-1.5 rounded-md text-slate-500 hover:text-accent hover:bg-slate-100 dark:hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Sparkles className={`h-4 w-4 ${descBusy ? 'animate-pulse' : ''}`} aria-hidden="true" />
                </button>
              </div>
              {!hasLlmAccess && (
                <p className="mt-1 text-[11px] text-slate-500">
                  AI features need a Groq API key.{' '}
                  <Link to="/settings" className="text-accent hover:underline">Connect in Settings</Link>.
                </p>
              )}
              {descError && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400" role="alert">
                  {descError}
                </p>
              )}
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Yield</span>
                <input
                  type="number"
                  min={1}
                  value={r.originalYield}
                  onChange={(e) => update('originalYield', Math.max(1, Number(e.target.value)))}
                  className="input mt-1 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">£/portion</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={r.pricePerPortion ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') return update('pricePerPortion', undefined);
                    const n = Number(raw);
                    if (Number.isFinite(n) && n >= 0) update('pricePerPortion', n);
                  }}
                  placeholder="—"
                  className="input mt-1 text-sm"
                  aria-label="Price per portion in GBP"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <TimePicker
                label="Prep time"
                value={r.prepTime}
                onChange={(v) => update('prepTime', v)}
              />
              <TimePicker
                label="Cook time"
                value={r.cookTime}
                onChange={(v) => update('cookTime', v)}
              />
            </div>

            <AllergensSection
              recipe={r}
              onChange={updateRecipeFromSection}
              onAllergenAudit={() => setAuditRefreshKey((k) => k + 1)}
            />

            <CalorieAnalysisSection
              recipe={r}
              onChange={updateRecipeFromSection}
            />

            <AllergenHistorySection recipeId={r.id} refreshKey={auditRefreshKey} />
          </aside>

          {/* MAIN BODY — the work surface. Ingredients + steps stack
              vertically so each gets the full main-column width;
              that's where the chef's attention goes during editing. */}
          <main className="space-y-6 min-w-0">
            <fieldset>
              <div className="flex items-center justify-between gap-2 mb-3">
                <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Ingredients ({r.ingredients.length})
                </legend>
                <button
                  type="button"
                  onClick={addIngredient}
                  data-testid="recipe-editor-add-ingredient"
                  className="btn-secondary text-xs"
                >
                  + Add ingredient
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Tip: type <code className="px-1 rounded bg-slate-100 dark:bg-surface-2">@</code> in an ingredient name to link another recipe (e.g. a sauce). The linked recipe's steps merge into the kitchen timeline.
              </p>
              <ul className="space-y-1">
                {r.ingredients.map((ing, i) => (
                  <IngredientRow
                    key={ing.id}
                    index={i}
                    value={ing}
                    currentRecipeId={r.id}
                    onChange={(next) => updateIngredient(i, next)}
                    onRemove={() => removeIngredient(i)}
                    allergenMatches={ing.allergenFlags ?? []}
                  />
                ))}
              </ul>
            </fieldset>

            <fieldset>
              <div className="flex items-center justify-between gap-2 mb-3">
                <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Steps ({r.steps.length})
                </legend>
                <button
                  type="button"
                  onClick={addStep}
                  data-testid="recipe-editor-add-step"
                  className="btn-secondary text-xs"
                >
                  + Add step
                </button>
              </div>
              {/* Sub-recipes referenced via `@` get their steps surfaced
                  here, ABOVE the parent's own steps. Each panel is
                  collapsed by default so the editor stays compact. */}
              <SubRecipeStepsList ingredients={r.ingredients} />
              <ul className="space-y-3 mt-3">
                {r.steps.map((s, i) => (
                  <StepRow
                    key={s.id}
                    index={i}
                    value={s}
                    onChange={(next) => updateStep(i, next)}
                    onRemove={() => removeStep(i)}
                  />
                ))}
              </ul>
            </fieldset>
          </main>
        </form>
      </section>
    </PinGate>
  );
}

// Compact cover-photo control for the sidebar. Reuses the same
// downscaleToDataUrl utility the card grid does so coverPhoto payloads
// stay bounded (~1024px max edge). When unset, shows a friendly
// placeholder. Inline clear button when a photo is present.
function CoverPhotoControl({
  coverPhoto,
  onChange,
}: {
  coverPhoto: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await downscaleToDataUrl(file, 1024);
      onChange(dataUrl);
      setPickError(null);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Failed to read image');
    }
  }

  return (
    <div>
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cover photo</span>
      <div className="mt-1 relative">
        {coverPhoto ? (
          <>
            <img
              src={coverPhoto}
              alt="Recipe cover"
              data-testid="recipe-editor-cover-img"
              className="w-full aspect-video object-cover rounded-md border border-slate-200 dark:border-slate-700"
            />
            <button
              type="button"
              onClick={() => onChange(undefined)}
              aria-label="Remove cover photo"
              data-testid="recipe-editor-cover-clear"
              className="absolute top-1 right-1 inline-flex items-center justify-center h-6 w-6 rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </>
        ) : (
          <div
            data-testid="recipe-editor-cover-placeholder"
            className="w-full aspect-video rounded-md border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-surface-2 flex items-center justify-center text-slate-400"
          >
            <ImageOff className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => void onPick(e)}
        data-testid="recipe-editor-cover-input"
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        data-testid="recipe-editor-cover-pick"
        className="mt-2 text-xs text-accent hover:underline"
      >
        {coverPhoto ? 'Change photo' : 'Add cover photo'}
      </button>
      {pickError && (
        <p role="alert" className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
          {pickError}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubRecipeStepsList — pull out the dedupe + iteration into its own tiny
// component so the Steps fieldset above stays readable. Renders one
// collapsible panel per unique `#`-linked sub-recipe; collapses to nothing
// when no ingredients are sub-recipe references.
// ---------------------------------------------------------------------------
function SubRecipeStepsList({ ingredients }: { ingredients: Ingredient[] }) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const ing of ingredients) {
    if (!ing.componentRecipeId) continue;
    if (seen.has(ing.componentRecipeId)) continue;
    seen.add(ing.componentRecipeId);
    ids.push(ing.componentRecipeId);
  }
  if (ids.length === 0) return null;
  return (
    <div className="mb-3 space-y-2" data-testid="sub-recipe-steps-list">
      {ids.map((id) => (
        <SubRecipeStepsPanel key={id} subRecipeId={id} />
      ))}
    </div>
  );
}
