import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import IngredientRow, { blankIngredient } from '../components/IngredientRow';
import StepRow, { blankStep } from '../components/StepRow';
import TimePicker from '../components/TimePicker';
import AnalysisSection from '../components/AnalysisSection';
import AllergenHistorySection from '../components/AllergenHistorySection';
import SubRecipeStepsPanel from '../components/SubRecipeStepsPanel';
import { getRecipe, saveRecipe } from '../../db/recipesRepo';
import {
  findAllergensInIngredient,
  isAllergenTag,
  applyRecipeAllergenAdd,
  applyRecipeAllergenRemove,
  applyIngredientAllergenAdd,
  applyIngredientAllergenRemove,
} from '../../core/recipes/llm/allergens';
import { loadReviewDraft } from '../../core/events/reviewDraft';
import { publishRecipe, unpublishRecipe } from '../../core/community/communityClient';
import { generateDescription } from '../../core/recipes/llm/descriptionGen';
import { getRecipeAllergens } from '../../core/recipes/llm/allergens';
import AllergenAttestationModal from '../components/AllergenAttestationModal';
import { usePublishedSet } from '../../state/usePublishedSet';
import { useProfileStore } from '../../state/useProfileStore';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';
import { useAuthGate } from '../../state/useAuthGate';
import type { AllergenTag, Recipe, RecipeAnalysis, Ingredient, WorkflowStep } from '../../core/types';

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

  function updateAnalysis(next: RecipeAnalysis) {
    // Diff the recipe-level allergens. Non-allergen analysis fields (calories,
    // keyIngredientTags, uncertainIngredients) flow through `working.analysis`
    // unchanged; only the allergen deltas trigger the cascade helpers, which
    // also flag/unflag matching ingredient rows.
    let working: Recipe = { ...r, analysis: next };
    const prevAllergens = new Set<AllergenTag>(
      (r.analysis?.allergens ?? []).filter(isAllergenTag),
    );
    const nextAllergens = new Set<AllergenTag>(
      (next.allergens ?? []).filter(isAllergenTag),
    );
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
    if (!window.confirm('Save changes to this recipe?')) return;
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
    <section className="p-4 md:p-6">
      {attestOpen && (
        <AllergenAttestationModal
          allergens={getRecipeAllergens(r) as string[]}
          submitting={shareBusy}
          onCancel={() => setAttestOpen(false)}
          onConfirm={() => void doPublish()}
        />
      )}
      <header className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-2xl font-bold">Edit recipe</h1>
        <div className="flex flex-wrap gap-2 items-center">
          {communityId ? (
            <>
              <span
                className="text-xs px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                data-testid="recipe-editor-published-badge"
              >
                Published
              </span>
              <button
                type="button"
                onClick={() => requireAuth(() => void handleUnpublish())}
                disabled={shareBusy}
                className="btn-secondary disabled:opacity-60"
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
              className="btn-secondary disabled:opacity-60"
              data-testid="recipe-editor-publish-btn"
            >
              {shareBusy ? 'Publishing…' : 'Share publicly'}
            </button>
          )}
          <button type="button" onClick={handleCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} className="btn-primary">
            Save
          </button>
        </div>
      </header>
      {shareError && (
        <p className="mb-3 text-sm text-rose-600 dark:text-rose-400" role="alert">
          {shareError}
        </p>
      )}

      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <AnalysisSection
          recipe={r}
          onChange={updateAnalysis}
          onAllergenAudit={() => setAuditRefreshKey((k) => k + 1)}
        />
        <AllergenHistorySection recipeId={r.id} refreshKey={auditRefreshKey} />

        <label className="block">
          <span className="text-sm font-medium">Name of Dish</span>
          <input
            type="text"
            value={r.title}
            onChange={(e) => update('title', e.target.value)}
            className="input mt-1"
            data-testid="recipe-editor-title-input"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Description</span>
          <div className="relative mt-1">
            <textarea
              value={r.description ?? ''}
              onChange={(e) => update('description', e.target.value || undefined)}
              rows={2}
              placeholder="Short description of the dish (optional)"
              className="input resize-y pr-10"
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
            <p className="mt-1 text-xs text-slate-500">
              AI features need a Groq API key.{' '}
              <Link to="/settings" className="text-accent hover:underline">Connect Groq in Settings</Link>.
            </p>
          )}
          {descError && (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400" role="alert">
              {descError}
            </p>
          )}
        </label>

        {/* Yield + Price/portion: compact numeric inputs, fit nicely in a 2-col grid. */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Yield (portions)</span>
            <input
              type="number"
              min={1}
              value={r.originalYield}
              onChange={(e) => update('originalYield', Math.max(1, Number(e.target.value)))}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Price / portion (£)</span>
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
              className="input mt-1"
              aria-label="Price per portion in GBP"
            />
          </label>
        </div>
        {/* TimePicker takes ~310px (hours input + minutes input + labels), so
            it gets its own 2-col row instead of sharing the narrow 4-col grid
            above. Below the md breakpoint they stack vertically. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        <div className="grid gap-4 md:grid-cols-2 items-start">
          <fieldset>
            <legend className="text-sm font-medium">Ingredients</legend>
            <p className="text-xs text-slate-500 mt-1 mb-2">
              Tip: type <code className="px-1 rounded bg-slate-100 dark:bg-surface-2">#</code> in an ingredient name to link another recipe (e.g. a sauce). The linked recipe expands inline and its steps merge into the kitchen timeline.
            </p>
            <ul className="space-y-3">
              {(() => {
                // Build the uncertain set once (per render) so every IngredientRow
                // gets an O(1) lookup. Lowercased to tolerate casing differences
                // between the LLM payload and the in-editor ingredient name.
                const uncertainSet = new Set(
                  (r.analysis?.uncertainIngredients ?? []).map((s) => s.toLowerCase()),
                );
                return r.ingredients.map((ing, i) => {
                  // User override wins; otherwise fall back to regex auto-detect
                  // against the recipe's declared allergens.
                  const effective = ing.allergenFlags
                    ?? findAllergensInIngredient(ing.name, r.analysis?.allergens ?? []);
                  const isUncertain = uncertainSet.has((ing.name ?? '').toLowerCase());
                  return (
                    <IngredientRow
                      key={ing.id}
                      index={i}
                      value={ing}
                      currentRecipeId={r.id}
                      onChange={(next) => updateIngredient(i, next)}
                      onRemove={() => removeIngredient(i)}
                      allergenMatches={effective}
                      uncertain={isUncertain}
                    />
                  );
                });
              })()}
            </ul>
            <button type="button" onClick={addIngredient} className="btn-secondary mt-3">
              Add ingredient
            </button>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">Steps</legend>
            {/* Sub-recipes referenced via `#` get their steps surfaced here,
                ABOVE the parent's own steps. Each panel is collapsed by default
                so the editor stays compact. Read-only — edit the sub-recipe
                via the "Open" link in the panel header. */}
            <SubRecipeStepsList ingredients={r.ingredients} />
            <ul className="space-y-3">
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
            <button type="button" onClick={addStep} className="btn-secondary mt-3">
              Add step
            </button>
          </fieldset>
        </div>
      </form>
    </section>
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
