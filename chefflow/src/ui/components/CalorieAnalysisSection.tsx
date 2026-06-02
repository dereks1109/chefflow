import { useState } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';
import { analyzeRecipe } from '../../core/recipes/llm/recipeGen';
import { LlmDailyQuotaExceededError } from '../../core/llm/llmClient';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import type { Recipe, RecipeAnalysis } from '../../core/types';

// ---------------------------------------------------------------------------
// CalorieAnalysisSection — AI-derived calorie estimate (per-portion + total).
// Renamed + slimmed from AnalysisSection on 2026-05-28; the chef-declared
// allergen + tag block was hived off to `AllergensSection.tsx` so the data
// shape of the editor matches the data ownership (calories = AI; allergens
// = chef-declared).
// ---------------------------------------------------------------------------

interface Props {
  recipe: Recipe;
  onChange: (next: Recipe) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'error'; message: string };

export default function CalorieAnalysisSection({ recipe, onChange }: Props) {
  const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
  const model = useLlmSettingsStore((s) => s.model);
  // See Workflow.tsx comment — proxy mode skips the Groq-key gate.
  const isProxyMode = (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy';
  const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
  const apiKey = isProxyMode ? 'proxy' : (storedApiKey || envApiKey).trim();
  const hasKey = isProxyMode || apiKey.length > 0;

  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const analysis: RecipeAnalysis = recipe.analysis ?? {};

  async function handleAnalyze() {
    if (!hasKey) {
      setStatus({ kind: 'error', message: 'No Groq API key — open Workflow → Connect Groq to add one.' });
      return;
    }
    setStatus({ kind: 'analyzing' });
    try {
      const nextAnalysis = await analyzeRecipe({ recipe, apiKey, model });
      // The LLM returns calorie estimates only — allergen output is banned
      // upstream in recipeGenPrompt and the keyIngredientTags field was
      // dropped in the 2026-05-28 simplification. Just spread the calorie
      // fields into analysis.
      onChange({
        ...recipe,
        analysis: { ...(recipe.analysis ?? {}), ...nextAnalysis },
      });
      setStatus({ kind: 'idle' });
    } catch (err) {
      if (err instanceof LlmDailyQuotaExceededError) {
        useUpgradeSheetStore.getState().openWith('llm');
        setStatus({ kind: 'idle' });
        return;
      }
      setStatus({ kind: 'error', message: friendlyError(err) });
    }
  }

  function patch(next: Partial<RecipeAnalysis>) {
    onChange({ ...recipe, analysis: { ...analysis, ...next } });
  }

  function setKcalPerPortion(raw: string) {
    if (raw === '') return patch({ caloriesPerPortion: undefined });
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) patch({ caloriesPerPortion: n });
  }

  function setKcalTotal(raw: string) {
    if (raw === '') return patch({ caloriesTotal: undefined });
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) patch({ caloriesTotal: n });
  }

  return (
    // T15 — boxed panel chrome restored; heading row uses inline accent
    // link for the AI button (was justify-between → button floated to the
    // right edge of the form, looked detached from its heading).
    <fieldset className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
        <legend className="text-base font-semibold px-1">Calorie estimate (AI)</legend>
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={status.kind === 'analyzing'}
          className="text-xs text-accent hover:underline inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed disabled:no-underline"
        >
          <Sparkles className={`h-3 w-3 ${status.kind === 'analyzing' ? 'animate-pulse' : ''}`} aria-hidden="true" />
          {status.kind === 'analyzing' ? 'Analysing…' : 'Analyse with AI'}
        </button>
      </div>

      {status.kind === 'error' && (
        <div
          role="status"
          className="mb-3 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-900 dark:text-red-200"
        >
          <p className="font-medium inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Couldn't analyse the recipe
          </p>
          <p className="mt-1 text-xs whitespace-pre-wrap">{status.message}</p>
        </div>
      )}

      {/* T16 (a)(b) — inline-label structure mirroring TimePicker so the
          input's right edge lines up with the TimePicker's minutes input
          right edge across the 3 numeric rows (Calorie / Yield-Price /
          Prep-Cook). Input width matches TimePicker's `w-20`. */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-500">Calories / portion (kcal)</span>
          <input
            type="number"
            min={0}
            value={analysis.caloriesPerPortion ?? ''}
            onChange={(e) => setKcalPerPortion(e.target.value)}
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
            value={analysis.caloriesTotal ?? ''}
            onChange={(e) => setKcalTotal(e.target.value)}
            placeholder="—"
            className="input w-20 text-right"
            aria-label="Calories total"
          />
        </label>
      </div>
    </fieldset>
  );
}

function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (/401/.test(m)) return 'Invalid API key. Check your Groq key in Workflow → Connect Groq.';
    if (/429/.test(m)) return 'Rate limited by Groq. Wait a minute and try again.';
    return m;
  }
  return String(err);
}
