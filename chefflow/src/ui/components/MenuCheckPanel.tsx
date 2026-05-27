import { useState } from 'react';
import { AlertTriangle, CheckCircle2, PoundSterling, ShieldAlert, Sparkles, Utensils } from 'lucide-react';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';
import { checkMenu } from '../../core/events/llm/menuCheck';
import { LlmDailyQuotaExceededError } from '../../core/llm/llmClient';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { getRecipe } from '../../db/recipesRepo';
import { saveEvent } from '../../db/eventsRepo';
import type { KitchenEvent, MenuAnalysis, MenuSuggestionCategory, Recipe } from '../../core/types';

interface Props {
  event: KitchenEvent;
  onAnalysisChange: (next: MenuAnalysis) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'error'; message: string };

// ---------------------------------------------------------------------------
// MenuCheckPanel — "Analyse menu" button + a structured verdict panel.
// Triggers an LLM call that compares the event's dietaryRequirements against
// the dish list (with allergens + key ingredients pulled from linked recipes)
// and renders the result inline. Result is persisted on the event so the
// verdict survives a reload.
// ---------------------------------------------------------------------------
export default function MenuCheckPanel({ event, onAnalysisChange }: Props) {
  const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
  const model = useLlmSettingsStore((s) => s.model);
  const isProxyMode = (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy';
  const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
  const apiKey = isProxyMode ? 'proxy' : (storedApiKey || envApiKey).trim();
  const hasKey = isProxyMode || apiKey.length > 0;

  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const analysis = event.menuAnalysis;
  const hasNotes = Boolean(event.notes?.trim());

  async function handleAnalyze() {
    if (!hasKey) {
      setStatus({ kind: 'error', message: 'No Groq API key — open Workflow → Connect Groq to add one.' });
      return;
    }
    setStatus({ kind: 'analyzing' });
    try {
      const recipes: Record<string, Recipe> = {};
      const linkedIds = Array.from(new Set(event.dishes.map((d) => d.recipeId).filter((id): id is string => !!id)));
      const fetched = await Promise.all(linkedIds.map((id) => getRecipe(id)));
      fetched.forEach((r, i) => {
        if (r) recipes[linkedIds[i]] = r;
      });
      const next = await checkMenu({ event, recipes, apiKey, model });
      await saveEvent({ ...event, menuAnalysis: next, updatedAt: Date.now() });
      onAnalysisChange(next);
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

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-5 bg-white dark:bg-kitchen-ink">
      <header className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold inline-flex items-center gap-2">
          <Utensils className="h-4 w-4" aria-hidden="true" />
          Menu suitability
        </h2>
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={status.kind === 'analyzing'}
          className="btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Sparkles className={`h-3.5 w-3.5 ${status.kind === 'analyzing' ? 'animate-pulse' : ''}`} aria-hidden="true" />
          {status.kind === 'analyzing' ? 'Analysing…' : (analysis ? 'Re-analyse' : 'Analyse menu')}
        </button>
      </header>

      {!hasNotes && !analysis && (
        <p className="text-sm text-slate-500 italic">
          Add guest dietary requirements to the Notes field on the edit page (e.g. "3 vegans, 1 peanut allergy"), then click Analyse menu.
        </p>
      )}

      {hasNotes && !analysis && status.kind !== 'analyzing' && status.kind !== 'error' && (
        <p className="text-sm text-slate-500 italic">
          Not analysed yet — click Analyse menu to check whether the dishes suit your guests.
        </p>
      )}

      {status.kind === 'error' && (
        <div
          role="status"
          className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-900 dark:text-red-200"
        >
          <p className="font-medium inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Couldn't analyse the menu
          </p>
          <p className="mt-1 text-xs whitespace-pre-wrap">{status.message}</p>
        </div>
      )}

      {analysis && <VerdictView analysis={analysis} />}
    </section>
  );
}

function VerdictView({ analysis }: { analysis: MenuAnalysis }) {
  const cfg = VERDICT_CONFIG[analysis.verdict];
  return (
    <div className="space-y-3">
      <div className={`rounded-md border p-3 text-sm flex items-start gap-2 ${cfg.classes}`}>
        <cfg.Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{cfg.headline}</p>
          <p className="text-xs opacity-80 mt-0.5">
            Analysed {new Date(analysis.analyzedAt).toLocaleString()}.
          </p>
        </div>
      </div>

      {analysis.issues.length > 0 && (
        <ul className="space-y-1.5">
          {analysis.issues.map((issue, i) => (
            <li
              key={i}
              className={`text-sm flex items-start gap-2 rounded-md border px-3 py-2 ${
                issue.severity === 'blocker'
                  ? 'border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10 text-red-900 dark:text-red-200'
                  : 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 text-amber-900 dark:text-amber-200'
              }`}
            >
              {issue.severity === 'blocker' ? (
                <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              )}
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      {analysis.suggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Suggestions (5)</p>
          <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            {analysis.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <SuggestionBadge category={s.category} />
                <span className="flex-1">{s.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SuggestionBadge({ category }: { category: MenuSuggestionCategory }) {
  const cfg = SUGGESTION_BADGE_CONFIG[category];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 ${cfg.classes}`}
      aria-label={`${cfg.label} suggestion`}
    >
      <cfg.Icon className="h-3 w-3" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

const SUGGESTION_BADGE_CONFIG: Record<MenuSuggestionCategory, {
  label: string;
  classes: string;
  Icon: typeof CheckCircle2;
}> = {
  allergy: {
    label: 'Allergy',
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    Icon: ShieldAlert,
  },
  budget: {
    label: 'Budget',
    classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    Icon: PoundSterling,
  },
  other: {
    label: 'Other',
    classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    Icon: Sparkles,
  },
};

const VERDICT_CONFIG: Record<MenuAnalysis['verdict'], {
  headline: string;
  classes: string;
  Icon: typeof CheckCircle2;
}> = {
  ok: {
    headline: 'Menu suits the declared guests.',
    classes: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-200',
    Icon: CheckCircle2,
  },
  warnings: {
    headline: 'Menu works with some caveats.',
    classes: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200',
    Icon: AlertTriangle,
  },
  blocked: {
    headline: 'Menu does not work for at least one guest.',
    classes: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200',
    Icon: ShieldAlert,
  },
};

function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (/401/.test(m)) return 'Invalid API key. Check your Groq key in Workflow → Connect Groq.';
    if (/429/.test(m)) return 'Rate limited by Groq. Wait a minute and try again.';
    return m;
  }
  return String(err);
}
