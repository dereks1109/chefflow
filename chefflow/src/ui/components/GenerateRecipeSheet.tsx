import { useEffect, useRef, useState } from 'react';
import { Camera, Pencil, Sparkles, Type, X, AlertTriangle } from 'lucide-react';
import LlmSettingsSheet from './LlmSettingsSheet';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';
import {
  generateRecipeFromText,
  generateRecipeFromPhoto,
} from '../../core/recipes/llm/recipeGen';
import { LlmDailyQuotaExceededError } from '../../core/llm/llmClient';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { randomId } from '../../core/util/id';
import { downscaleToDataUrl } from '../../core/util/image';
import type { Recipe } from '../../core/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (recipe: Recipe) => void;
  /**
   * Pre-fills the title of a newly-created blank recipe (manual tab). Used
   * when the chef typed a dish name in the event timeline and clicked
   * "Create new recipe: <name>" — that name is carried over here instead
   * of defaulting to "Untitled recipe".
   */
  initialTitle?: string;
}

type Tab = 'manual' | 'describe' | 'photo';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

const MAX_IMAGE_EDGE = 1600;

export default function GenerateRecipeSheet({ open, onClose, onCreated, initialTitle }: Props) {
  const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
  const model = useLlmSettingsStore((s) => s.model);
  // See Workflow.tsx comment — proxy mode skips the Groq-key gate.
  const isProxyMode = (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy';
  const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
  const apiKey = isProxyMode ? 'proxy' : (storedApiKey || envApiKey).trim();
  const hasKey = isProxyMode || apiKey.length > 0;

  const [tab, setTab] = useState<Tab>('manual');
  const [dish, setDish] = useState('');
  const [portions, setPortions] = useState<string>('4');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFilename, setImageFilename] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [keySheetOpen, setKeySheetOpen] = useState(false);

  const dishInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when opened.
  useEffect(() => {
    if (open) {
      setTab('manual');
      setDish('');
      setPortions('4');
      setImageDataUrl(null);
      setImageFilename(null);
      setStatus({ kind: 'idle' });
    }
  }, [open]);

  // Focus the description textarea whenever the Describe tab becomes active.
  useEffect(() => {
    if (open && tab === 'describe') {
      setTimeout(() => dishInputRef.current?.focus(), 0);
    }
  }, [open, tab]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function parsedPortions(): number | undefined {
    const n = Number.parseInt(portions, 10);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ kind: 'idle' });
    setImageFilename(file.name);
    try {
      const downscaled = await downscaleToDataUrl(file, MAX_IMAGE_EDGE);
      setImageDataUrl(downscaled);
    } catch (err) {
      setStatus({
        kind: 'error',
        message: `Couldn't read image: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  async function handleSubmit() {
    // Manual mode never calls the LLM — just emits a blank Recipe.
    if (tab === 'manual') {
      onCreated(buildBlankRecipe(parsedPortions() ?? 1, initialTitle?.trim() || undefined));
      return;
    }
    if (!hasKey) {
      setKeySheetOpen(true);
      return;
    }
    setStatus({ kind: 'submitting' });
    try {
      let recipe: Recipe;
      if (tab === 'describe') {
        if (dish.trim().length === 0) {
          setStatus({ kind: 'error', message: 'Describe what you want first.' });
          return;
        }
        recipe = await generateRecipeFromText({
          dish: dish.trim(),
          portions: parsedPortions(),
          apiKey,
          model,
        });
      } else {
        if (!imageDataUrl) {
          setStatus({ kind: 'error', message: 'Pick a photo first.' });
          return;
        }
        recipe = await generateRecipeFromPhoto({
          imageDataUrl,
          portions: parsedPortions(),
          apiKey,
        });
      }
      onCreated(recipe);
    } catch (err) {
      if (err instanceof LlmDailyQuotaExceededError) {
        useUpgradeSheetStore.getState().openWith('llm');
        setStatus({ kind: 'idle' });
        return;
      }
      setStatus({ kind: 'error', message: friendlyError(err) });
    }
  }

  const submitting = status.kind === 'submitting';

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gen-recipe-title"
        className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
            <h2 id="gen-recipe-title" className="font-semibold inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              New recipe
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="touch-target px-2 rounded-md text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          {/* Mode picker */}
          <div className="px-5 pt-3" role="tablist" aria-label="Input mode">
            <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              <TabButton active={tab === 'manual'} onClick={() => setTab('manual')} icon={<Pencil className="h-3.5 w-3.5" />} testId="recipe-tab-manual">
                Manual
              </TabButton>
              <TabButton active={tab === 'describe'} onClick={() => setTab('describe')} icon={<Type className="h-3.5 w-3.5" />} testId="recipe-tab-describe">
                Describe
              </TabButton>
              <TabButton active={tab === 'photo'} onClick={() => setTab('photo')} icon={<Camera className="h-3.5 w-3.5" />} testId="recipe-tab-photo">
                Photo
              </TabButton>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4 text-sm">
            {tab === 'manual' && (
              <p className="text-slate-600 dark:text-slate-400">
                Start with a blank recipe and fill in the title, ingredients, and steps yourself.
                No AI involved.
              </p>
            )}

            {tab === 'describe' && (
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Describe the recipe</span>
                <textarea
                  ref={dishInputRef}
                  value={dish}
                  onChange={(e) => setDish(e.target.value)}
                  placeholder="e.g. A hearty beef stew with red wine and pearl onions, gluten-free, for 6 portions"
                  rows={4}
                  className="input mt-1"
                  aria-label="Recipe description"
                  data-testid="recipe-sheet-describe-textarea"
                />
                <span className="block mt-1 text-xs text-slate-500">
                  Anything goes — dish name, dietary notes, cuisine, constraints.
                </span>
              </label>
            )}

            {tab === 'photo' && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-slate-500">Recipe photo</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onPickPhoto}
                  className="hidden"
                  aria-label="Pick recipe photo"
                  data-testid="recipe-sheet-photo-input"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary text-sm inline-flex items-center gap-2 w-full justify-center"
                  data-testid="recipe-sheet-photo-pick-button"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  {imageFilename ? `Replace photo (${truncate(imageFilename, 28)})` : 'Choose / snap a recipe photo'}
                </button>
                {imageDataUrl && (
                  <img
                    src={imageDataUrl}
                    alt="Selected recipe"
                    className="max-h-40 w-auto mx-auto rounded-md border border-slate-200 dark:border-slate-700"
                  />
                )}
              </div>
            )}

            <label className="block">
              <span className="text-xs font-medium text-slate-500">Portions</span>
              <input
                type="number"
                min={1}
                value={portions}
                onChange={(e) => setPortions(e.target.value)}
                className="input mt-1"
                aria-label="Portions"
              />
            </label>

            {tab !== 'manual' && !hasKey && (
              <p className="text-xs text-amber-700 dark:text-amber-300 inline-flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                No Groq API key found. You'll be asked to add one before submitting.
              </p>
            )}

            {status.kind === 'error' && (
              <div
                role="status"
                className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-900 dark:text-red-200"
              >
                <p className="font-medium inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Couldn't create the recipe
                </p>
                <p className="mt-1 text-xs whitespace-pre-wrap">{status.message}</p>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              data-testid={tab === 'manual' ? 'recipe-sheet-create-blank' : 'recipe-sheet-submit'}
              className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {tab === 'manual' ? (
                <>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Create blank
                </>
              ) : (
                <>
                  <Sparkles className={`h-3.5 w-3.5 ${submitting ? 'animate-pulse' : ''}`} aria-hidden="true" />
                  {submitting ? 'Generating…' : 'Generate'}
                </>
              )}
            </button>
          </footer>
        </div>
      </div>

      <LlmSettingsSheet open={keySheetOpen} onClose={() => setKeySheetOpen(false)} />
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={testId}
      className={[
        'px-3 py-1.5 text-xs inline-flex items-center gap-1.5',
        active
          ? 'bg-accent text-white'
          : 'bg-white dark:bg-kitchen-ink text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (/401/.test(m)) return 'Invalid API key. Check your Groq key in settings.';
    if (/429/.test(m)) return 'Rate limited by Groq. Wait a minute and try again.';
    return m;
  }
  return String(err);
}

function buildBlankRecipe(yieldCount: number, title?: string): Recipe {
  const now = Date.now();
  return {
    id: randomId(),
    title: title && title.length > 0 ? title : 'Untitled recipe',
    originalYield: Math.max(1, yieldCount),
    ingredients: [],
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

