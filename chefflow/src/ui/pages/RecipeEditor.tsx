import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Sparkles } from 'lucide-react';
import IngredientRow, { blankIngredient } from '../components/IngredientRow';
import StepRow, { blankStep } from '../components/StepRow';
import TimePicker from '../components/TimePicker';
import AllergensSection from '../components/AllergensSection';
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
import { analyzeRecipe } from '../../core/recipes/llm/recipeGen';
import { LlmDailyQuotaExceededError } from '../../core/llm/llmClient';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { getRecipeAllergens } from '../../core/recipes/llm/allergens';
import AllergenAttestationModal from '../components/AllergenAttestationModal';
import RecipeSaveAttestationModal from '../components/RecipeSaveAttestationModal';
import PinGate from '../components/PinGate';
import SharedReadOnlyBanner from '../components/SharedReadOnlyBanner';
import VisibilityControl from '../components/VisibilityControl';
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
  // T17 — combined "Recipe details" section runs calorie analysis +
  // description generation from ONE button. Shared busy/error state
  // replaces the per-field flags from T16 and earlier.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
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

  // T5 Phase B — the chef's chosen community-publish state, decoupled
  // from the server-side communityId. The Community pill writes to this
  // local; handleSave/actualSave diff against the snapshot at load
  // time to decide whether to fire publishRecipe or unpublishRecipe.
  const [communityChecked, setCommunityChecked] = useState(false);
  const [originalCommunityId, setOriginalCommunityId] = useState<string | undefined>(undefined);
  // Carries the "save fired, modal needs to navigate after publish"
  // signal so the AllergenAttestationModal's onConfirm can complete
  // the save flow.
  const [pendingPublishNavigate, setPendingPublishNavigate] = useState(false);

  useEffect(() => {
    // Re-snapshot when the published state hydrates (the publishedSet
    // populates after the first sync). Only refreshes the snapshot
    // BEFORE the chef has dirtied anything — once they've started
    // editing, the original state is locked in.
    if (!dirty) {
      setOriginalCommunityId(communityId);
      setCommunityChecked(!!communityId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

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
  // T3c Phase 4 — when this recipe was shared from an Enterprise owner
  // to the caller (sync engine stamped readOnly=true on apply), render
  // the editor in view-only mode: hide all mutating affordances, wrap
  // the form in a disabled fieldset (HTML-native cascade disables every
  // child input/button) and show the explanatory banner. The owner's
  // own editor session is unaffected — readOnly is only true on rows
  // that arrived via team_memberships fan-in.
  const readOnly = r.readOnly === true;

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

    // T5 — diff the Community pill state against the snapshot taken
    // at recipe load. Four cases:
    //   was unpublished, now ticked   → first-time publish (allergen
    //                                   attestation modal, then navigate)
    //   was published, now unticked   → unpublish, then navigate
    //   was published, still ticked   → auto-republish (worker uses
    //                                   author+sourceLocalId as update
    //                                   key — likes/copies survive)
    //   was unpublished, still unticked → no-op
    const wasPublished = !!originalCommunityId;
    if (communityChecked && !wasPublished) {
      // Open the allergen attestation modal; doPublish navigates
      // after the publish completes.
      setShareError(null);
      setPendingPublishNavigate(true);
      setAttestOpen(true);
      return; // navigate deferred to doPublish onConfirm
    }
    if (!communityChecked && wasPublished && originalCommunityId) {
      try {
        await unpublishRecipe(originalCommunityId);
        unlinkPublished(r.id);
      } catch (err: unknown) {
        // eslint-disable-next-line no-console
        console.warn('[RecipeEditor] unpublish failed', err);
      }
    } else if (communityChecked && wasPublished) {
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

  // T5 — runs when the chef confirms the allergen attestation modal
  // after a first-time community publish was queued by actualSave.
  // Performs the publish and then completes the deferred navigate.
  async function doPublish() {
    setShareBusy(true);
    try {
      const nameToSend = showNameOnCommunity ? displayName : '';
      const { id: newCommunityId } = await publishRecipe(r, nameToSend);
      linkPublished(r.id, newCommunityId);
      setAttestOpen(false);
      if (pendingPublishNavigate) {
        setPendingPublishNavigate(false);
        navigate(returnRoute());
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setShareBusy(false);
    }
  }

  /**
   * T17 — single AI handler covering the whole Recipe-details section.
   * Runs analyzeRecipe (kcal) + generateDescription in parallel via
   * Promise.allSettled so a partial failure still ships the other
   * result. Skips description generation when the chef has already
   * written one (description regeneration was previously gated by a
   * window.confirm — preserve that "don't trample chef-typed copy"
   * intent by silently skipping instead).
   */
  async function handleAnalyzeAll() {
    if (!hasLlmAccess) {
      setAiError('Connect Groq in Settings to enable AI features.');
      return;
    }
    setAiBusy(true);
    setAiError(null);
    const hasExistingDescription = !!(r.description && r.description.trim().length > 0);
    const [calorieRes, descRes] = await Promise.allSettled([
      analyzeRecipe({ recipe: r, apiKey, model }),
      hasExistingDescription
        ? Promise.resolve(r.description!)
        : generateDescription({ recipe: r, apiKey, model }),
    ]);
    // Quota exhaustion is a session-wide signal — open the upgrade sheet
    // even if only one of the two calls hit it.
    const quotaHit = [calorieRes, descRes].some(
      (res) => res.status === 'rejected' && res.reason instanceof LlmDailyQuotaExceededError,
    );
    if (quotaHit) {
      useUpgradeSheetStore.getState().openWith('llm');
      setAiBusy(false);
      return;
    }
    let next: Recipe = r;
    if (calorieRes.status === 'fulfilled') {
      next = { ...next, analysis: { ...(next.analysis ?? {}), ...calorieRes.value } };
    }
    if (
      descRes.status === 'fulfilled' &&
      typeof descRes.value === 'string' &&
      !hasExistingDescription
    ) {
      next = { ...next, description: descRes.value };
    }
    if (next !== r) commitRecipe(next);
    if (calorieRes.status === 'rejected' && descRes.status === 'rejected') {
      setAiError('AI analysis failed. Check your Groq connection and try again.');
    } else if (calorieRes.status === 'rejected') {
      setAiError('Calorie analysis failed (description was generated).');
    } else if (descRes.status === 'rejected') {
      setAiError('Description generation failed (calories were analysed).');
    }
    setAiBusy(false);
  }

  return (
    <PinGate>
    {/* T13 — max-w-3xl + mx-auto: pre-T12 the bordered fieldsets gave
        each section a visual anchor even though the form was full-
        width. T12 dropped the fieldsets, exposing the sprawl across
        ~1500px on desktop (Analyse-with-AI button at the right edge,
        Calorie inputs at 750px each, ingredient name floating in
        empty space). Constraining the section to 768px centred fixes
        all of those in one move without re-adding the heavy chrome. */}
    <section className="p-4 md:p-6 max-w-3xl mx-auto">
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
      <header className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-2xl font-bold">{readOnly ? 'Recipe' : 'Edit recipe'}</h1>
        <div className="flex flex-wrap gap-2 items-center">
          {/* T5: Published badge stays in the header but is now driven
              by the server-side communityId (set by the publish flow
              inside actualSave). The Community pill in the editor
              (VisibilityControl below) carries the user's intent. */}
          {!readOnly && communityId && (
            <span
              className="text-xs px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              data-testid="recipe-editor-published-badge"
            >
              Published
            </span>
          )}
          {!readOnly && (
            <button type="button" onClick={handleCancel} className="btn-secondary">
              Cancel
            </button>
          )}
          {!readOnly ? (
            <button type="button" onClick={() => void handleSave()} className="btn-primary">
              Save
            </button>
          ) : (
            <button type="button" onClick={handleCancel} className="btn-secondary">
              Back
            </button>
          )}
        </div>
      </header>
      {readOnly && <SharedReadOnlyBanner scope="recipe" />}
      {shareError && (
        <p className="mb-3 text-sm text-rose-600 dark:text-rose-400" role="alert">
          {shareError}
        </p>
      )}

      <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
        {/* `contents` keeps the fieldset out of the box model so the
            parent form's space-y-4 between siblings stays intact while
            still cascading `disabled` to every child input/button. */}
        <fieldset disabled={readOnly} className="contents">
        {/* T5 Phase B — unified "Visible to" multi-check. Replaces the
            old Share-publicly / Unpublish header buttons + the per-team
            chip row. Community pill triggers publish/unpublish inside
            actualSave (only on Save click, not on every tick). Team
            pills update sharedWithGroupIds inline. Self-hides for
            non-Enterprise + non-recipe callers, and for read-only views. */}
        <VisibilityControl
          selectedGroupIds={r.sharedWithGroupIds}
          community={{ checked: communityChecked, onChange: (next) => { setCommunityChecked(next); setDirty(true); } }}
          onGroupsChange={(next) => update('sharedWithGroupIds', next)}
          readOnly={readOnly}
        />
        {/* Field order (2026-05-28): name first, then chef-declared
            allergens (so the safety-critical metadata is captured before
            the chef gets into the ingredient/step weeds), then the AI
            calorie estimate, then the rest. */}
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

        <AllergensSection
          recipe={r}
          onChange={updateRecipeFromSection}
          onAllergenAudit={() => setAuditRefreshKey((k) => k + 1)}
        />
        <AllergenHistorySection recipeId={r.id} refreshKey={auditRefreshKey} />

        {/* T17 — combined "Recipe details" section. Description, Calories,
            Yield/Price, Prep/Cook all sit in one box with a single
            "Analyse with AI" button at the top that runs calorie
            analysis + description generation in parallel. */}
        <fieldset className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink space-y-4">
          <div className="flex items-baseline gap-3 flex-wrap">
            <legend className="text-base font-semibold px-1">Recipe details</legend>
            <button
              type="button"
              onClick={() => requireAuth(() => void handleAnalyzeAll())}
              disabled={aiBusy || !hasLlmAccess}
              data-testid="recipe-editor-analyse-all"
              title={hasLlmAccess ? 'Run AI for calories + description' : 'Connect Groq in Settings to enable AI features'}
              className="text-xs text-accent hover:underline inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed disabled:no-underline"
            >
              <Sparkles className={`h-3 w-3 ${aiBusy ? 'animate-pulse' : ''}`} aria-hidden="true" />
              {aiBusy ? 'Analysing…' : 'Analyse with AI'}
            </button>
          </div>

          {!hasLlmAccess && (
            <p className="text-xs text-slate-500">
              AI features need a Groq API key.{' '}
              <Link to="/settings" className="text-accent hover:underline">Connect Groq in Settings</Link>.
            </p>
          )}
          {aiError && (
            <p
              data-testid="recipe-editor-ai-error"
              role="alert"
              className="text-xs text-rose-600 dark:text-rose-400 inline-flex items-start gap-1.5"
            >
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              {aiError}
            </p>
          )}

          {/* Description */}
          <label className="block">
            <span className="text-sm font-medium">Description</span>
            <textarea
              value={r.description ?? ''}
              onChange={(e) => update('description', e.target.value || undefined)}
              rows={2}
              placeholder="Short description of the dish (optional)"
              className="input resize-y mt-1"
              data-testid="recipe-editor-description-input"
            />
          </label>

          {/* Calorie row — inline labels, right-aligned w-20 inputs */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500">Calories / portion (kcal)</span>
              <input
                type="number"
                min={0}
                value={r.analysis?.caloriesPerPortion ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = raw === '' ? undefined : (Number.isFinite(Number.parseInt(raw, 10)) ? Number.parseInt(raw, 10) : undefined);
                  commitRecipe({ ...r, analysis: { ...(r.analysis ?? {}), caloriesPerPortion: next } });
                }}
                placeholder="—"
                className="input w-20 text-right"
                aria-label="Calories per portion"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500">Calories total (kcal)</span>
              <input
                type="number"
                min={0}
                value={r.analysis?.caloriesTotal ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = raw === '' ? undefined : (Number.isFinite(Number.parseInt(raw, 10)) ? Number.parseInt(raw, 10) : undefined);
                  commitRecipe({ ...r, analysis: { ...(r.analysis ?? {}), caloriesTotal: next } });
                }}
                placeholder="—"
                className="input w-20 text-right"
                aria-label="Calories total"
              />
            </label>
          </div>

          {/* Yield + Price */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Yield (portions)</span>
              <input
                type="number"
                min={1}
                value={r.originalYield}
                onChange={(e) => update('originalYield', Math.max(1, Number(e.target.value)))}
                className="input w-20 text-right"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
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
                className="input w-20 text-right"
                aria-label="Price per portion in GBP"
              />
            </label>
          </div>

          {/* Prep + Cook */}
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
        </fieldset>

        {/* T16 (e) — 30/70 split: Ingredients column for short labels
            (1-3 words), Steps column for sentence-long instructions.
            Smaller gap (gap-3) shifts Steps left for compactness.
            T17 (1) — items-stretch so the Steps panel matches the
            Ingredients panel height even when step count < ingredient
            count (extra blank space sits at the Steps panel's bottom).
            T18 — minmax(0, Nfr) prevents the column from growing to fit
            ingredient-row content (the prior `3fr_7fr` default is
            `minmax(auto, 1fr)` which lets a child's min-content push the
            column wider, breaking the 30/70 ratio when chefs add ingredients). */}
        <div className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] items-stretch">
          {/* T15 — match the boxed-panel chrome of the Allergens / Calorie
              sections above so the form reads consistently as grouped
              sections rather than loose fields. */}
          <fieldset className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
            <legend className="text-base font-semibold px-1">Ingredients</legend>
            <p className="text-xs text-slate-500 mt-1 mb-2">
              Tip: type <code className="px-1 rounded bg-slate-100 dark:bg-surface-2">#</code> in an ingredient name to link another recipe (e.g. a sauce). The linked recipe expands inline and its steps merge into the kitchen timeline.
            </p>
            <ul className="space-y-3">
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
            <button type="button" onClick={addIngredient} className="btn-secondary mt-3">
              Add ingredient
            </button>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
            <legend className="text-base font-semibold px-1">Steps</legend>
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
        </fieldset>
      </form>
    </section>
    </PinGate>
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
