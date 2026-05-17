import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Pencil,
  Sparkles,
  Type,
  X,
  AlertTriangle,
  BookOpen,
  Plus,
  Hand,
  Check,
  ArrowLeft,
  Search,
} from 'lucide-react';
import LlmSettingsSheet from './LlmSettingsSheet';
import { useLlmSettingsStore } from '../../state/llmSettingsStore';
import { generateEventFromText } from '../../core/events/llm/eventGen';
import { listRecipes, saveRecipe } from '../../db/recipesRepo';
import { randomId } from '../../core/util/id';
import {
  saveReviewDraft,
  clearReviewDraft,
  type SerializedReviewDraft,
} from '../../core/events/reviewDraft';
import type { KitchenEvent, Dish, Recipe } from '../../core/types';

/**
 * When set, opens the sheet directly into the review step with a previously
 * saved draft + a snapshot of the recipe library — used to bring the chef
 * back here after they detour through the recipe editor to fill in a stub.
 */
export interface ResumeReview {
  draft: SerializedReviewDraft;
  recipes: Recipe[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (event: KitchenEvent) => void;
  initialReview?: ResumeReview;
}

type Tab = 'manual' | 'describe';
// "Create new" is no longer deferred — it commits immediately on confirm
// (see createAndLinkRecipe). Only "ready" needs to ride along in state.
type ReviewChoice = 'ready';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | {
      kind: 'review';
      event: KitchenEvent;
      /** Full recipe library — fed to the per-dish search picker. */
      recipes: Recipe[];
      /** Per-dish recipe match (undefined when no library recipe matched). */
      matches: Record<string, Recipe | undefined>;
      /** For unmatched dishes only — the user's per-dish choice. */
      choices: Record<string, ReviewChoice | undefined>;
    }
  | { kind: 'finalising' };

// ---------------------------------------------------------------------------
// GenerateEventSheet — modal launched from the Events library.
//
// Flow:
//   1. Pick tab (Manual / Describe).
//   2. Manual → emit a blank event immediately. Describe → call LLM.
//   3. After LLM returns, transition to a Review step that matches each
//      extracted dish against the recipe library. Matched dishes get linked
//      automatically; unmatched dishes prompt the user to choose between
//      "Create new recipe" (saves a stub recipe + links) and "The dish is
//      ready to go" (sets isPrepared=true, no recipe needed).
// ---------------------------------------------------------------------------
export default function GenerateEventSheet({ open, onClose, onCreated, initialReview }: Props) {
  const navigate = useNavigate();
  const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
  const model = useLlmSettingsStore((s) => s.model);
  const isProxyMode = (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy';
  const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
  const apiKey = isProxyMode ? 'proxy' : (storedApiKey || envApiKey).trim();
  const hasKey = isProxyMode || apiKey.length > 0;

  const [tab, setTab] = useState<Tab>('manual');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [keySheetOpen, setKeySheetOpen] = useState(false);
  // UI-only state — which dish's recipe-search picker is open. One at a time.
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);

  const textInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setPickerOpenFor(null);
    if (initialReview) {
      // Hydrate the review state from a saved draft — used when the chef
      // returns from the recipe editor after creating a stub mid-review.
      const { draft, recipes } = initialReview;
      const matches: Record<string, Recipe | undefined> = {};
      for (const [dishId, recipeId] of Object.entries(draft.matchRecipeIds)) {
        const r = recipes.find((rec) => rec.id === recipeId);
        if (r) matches[dishId] = r;
      }
      const choices: Record<string, ReviewChoice | undefined> = {};
      for (const dishId of draft.readyDishIds) {
        choices[dishId] = 'ready';
      }
      setStatus({ kind: 'review', event: draft.event, recipes, matches, choices });
      clearReviewDraft();
      return;
    }
    setTab('manual');
    setText('');
    setStatus({ kind: 'idle' });
  }, [open, initialReview]);

  useEffect(() => {
    if (open && tab === 'describe') {
      setTimeout(() => textInputRef.current?.focus(), 0);
    }
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit() {
    if (tab === 'manual') {
      onCreated(buildBlankEvent());
      return;
    }
    if (!hasKey) {
      setKeySheetOpen(true);
      return;
    }
    if (text.trim().length === 0) {
      setStatus({ kind: 'error', message: 'Paste or type some text first.' });
      return;
    }
    setStatus({ kind: 'submitting' });
    try {
      const event = await generateEventFromText({
        text: text.trim(),
        apiKey,
        model,
      });
      // Match each extracted dish against the recipe library so the chef can
      // confirm/override per dish before the event lands.
      const recipes = await listRecipes();
      const matches: Record<string, Recipe | undefined> = {};
      for (const d of event.dishes) {
        matches[d.id] = findRecipeMatch(d.name, recipes);
      }
      const eventWithLinks: KitchenEvent = {
        ...event,
        dishes: event.dishes.map((d) => ({
          ...d,
          recipeId: matches[d.id]?.id ?? d.recipeId,
        })),
      };
      setStatus({ kind: 'review', event: eventWithLinks, recipes, matches, choices: {} });
    } catch (err) {
      setStatus({ kind: 'error', message: friendlyError(err) });
    }
  }

  // Picking Ready closes any open picker for this dish — only one of the
  // three actions can be active at a time.
  function setChoice(dishId: string, choice: ReviewChoice) {
    if (status.kind !== 'review') return;
    if (pickerOpenFor === dishId) setPickerOpenFor(null);
    setStatus({
      ...status,
      choices: { ...status.choices, [dishId]: choice },
    });
  }

  // Opening the search picker clears any pending Ready choice for that dish.
  function togglePicker(dishId: string) {
    if (pickerOpenFor === dishId) {
      setPickerOpenFor(null);
      return;
    }
    setPickerOpenFor(dishId);
    if (status.kind === 'review' && status.choices[dishId]) {
      setStatus({
        ...status,
        choices: { ...status.choices, [dishId]: undefined },
      });
    }
  }

  function linkRecipe(dishId: string, recipe: Recipe) {
    if (status.kind !== 'review') return;
    setStatus({
      ...status,
      matches: { ...status.matches, [dishId]: recipe },
      choices: { ...status.choices, [dishId]: undefined },
    });
    setPickerOpenFor(null);
  }

  function unlinkRecipe(dishId: string) {
    if (status.kind !== 'review') return;
    setStatus({
      ...status,
      matches: { ...status.matches, [dishId]: undefined },
    });
  }

  // Click "Create new recipe" → confirm → save a stub + persist the review
  // state to sessionStorage → close the sheet and navigate the chef to the
  // recipe editor for the new stub. RecipeEditor's save/cancel handlers know
  // to bring them back to /events, where the library reopens this sheet in
  // review mode with the stub already linked to the dish.
  async function createAndLinkRecipe(dishId: string) {
    if (status.kind !== 'review') return;
    const dish = status.event.dishes.find((d) => d.id === dishId);
    if (!dish) return;
    const label = dish.name.trim() || 'this dish';
    const ok = window.confirm(
      `Create a new recipe for "${label}"?\n\n` +
      `You'll be taken to the recipe editor to fill in details. ` +
      `When you save the recipe, you'll return here to finish the event.`,
    );
    if (!ok) return;
    const newId = randomId();
    const now = Date.now();
    const stub: Recipe = {
      id: newId,
      title: dish.name || 'Untitled recipe',
      originalYield: dish.portions || 1,
      ingredients: [],
      steps: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveRecipe(stub);
    // Snapshot the current review state (event + matches + ready picks +
    // which stub we're filling in) so EventsLibrary can rehydrate the sheet
    // when the chef returns.
    const matchRecipeIds: Record<string, string> = {};
    for (const [id, r] of Object.entries(status.matches)) {
      if (r) matchRecipeIds[id] = r.id;
    }
    matchRecipeIds[dishId] = newId;
    const readyDishIds = Object.entries(status.choices)
      .filter(([, c]) => c === 'ready')
      .map(([id]) => id);
    saveReviewDraft({
      event: status.event,
      matchRecipeIds,
      readyDishIds,
      awaitingRecipeId: newId,
    });
    onClose();
    navigate(`/recipes/${newId}/edit`);
  }

  async function handleFinalise() {
    if (status.kind !== 'review') return;
    const { event, matches } = status;
    setStatus({ kind: 'finalising' });
    try {
      const finalDishes: Dish[] = event.dishes.map((dish) => {
        const matched = matches[dish.id];
        if (matched) {
          // Apply the link unconditionally so a user-picked match (via Search
          // or Create-new) wins over whatever the LLM may have produced.
          return { ...dish, recipeId: matched.id, isPrepared: false };
        }
        // The reviewReady gate guarantees choice === 'ready' here.
        return { ...dish, recipeId: undefined, isPrepared: true };
      });
      onCreated({ ...event, dishes: finalDishes });
    } catch (err) {
      setStatus({ kind: 'error', message: friendlyError(err) });
    }
  }

  function backToInput() {
    setStatus({ kind: 'idle' });
  }

  const submitting = status.kind === 'submitting';
  const finalising = status.kind === 'finalising';
  const inReview = status.kind === 'review';
  const reviewReady =
    status.kind === 'review' &&
    status.event.dishes.every(
      (d) => Boolean(status.matches[d.id]) || Boolean(status.choices[d.id]),
    );

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gen-event-title"
        className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl max-h-[90vh] flex flex-col"
          onClick={(ev) => ev.stopPropagation()}
        >
          <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
            <h2 id="gen-event-title" className="font-semibold inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {inReview || finalising ? 'Review extracted event' : 'New event'}
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

          {!inReview && !finalising && (
            <div className="px-5 pt-3" role="tablist" aria-label="Input mode">
              <div className="grid grid-cols-2 gap-1 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                <TabButton active={tab === 'manual'} onClick={() => setTab('manual')} icon={<Pencil className="h-3.5 w-3.5" />}>
                  Manual
                </TabButton>
                <TabButton active={tab === 'describe'} onClick={() => setTab('describe')} icon={<Type className="h-3.5 w-3.5" />}>
                  Extract from text
                </TabButton>
              </div>
            </div>
          )}

          <div className="px-5 py-4 space-y-4 text-sm overflow-y-auto">
            {!inReview && !finalising && tab === 'manual' && (
              <p className="text-slate-600 dark:text-slate-400">
                Start with a blank event and fill in title, time, location, dishes, and notes yourself.
                No AI involved.
              </p>
            )}

            {!inReview && !finalising && tab === 'describe' && (
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Paste an event description</span>
                <textarea
                  ref={textInputRef}
                  value={text}
                  onChange={(ev) => setText(ev.target.value)}
                  placeholder="Paste an invite, brief, or text block. e.g.
&#10;Sunday dinner at 12 Greenfield Rd, 7:30pm. 6 guests, 2 vegans, 1 peanut allergy. Plan: beef bourguignon, roasted veg, lemon tart."
                  rows={8}
                  className="input mt-1"
                  aria-label="Event description"
                />
                <span className="block mt-1 text-xs text-slate-500">
                  Title, date/time, location, dishes, and dietary notes will be extracted into editable fields.
                </span>
              </label>
            )}

            {!inReview && !finalising && tab !== 'manual' && !hasKey && (
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
                  Couldn't create the event
                </p>
                <p className="mt-1 text-xs whitespace-pre-wrap">{status.message}</p>
              </div>
            )}

            {inReview && status.kind === 'review' && (
              <ReviewView
                event={status.event}
                recipes={status.recipes}
                matches={status.matches}
                choices={status.choices}
                pickerOpenFor={pickerOpenFor}
                onChoose={setChoice}
                onTogglePicker={togglePicker}
                onPickRecipe={linkRecipe}
                onUnlink={unlinkRecipe}
                onCreateNew={(id) => void createAndLinkRecipe(id)}
              />
            )}
          </div>

          <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
            {inReview ? (
              <>
                <button
                  type="button"
                  onClick={backToInput}
                  className="btn-secondary text-sm inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void handleFinalise()}
                  disabled={!reviewReady || finalising}
                  className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Check className={`h-3.5 w-3.5 ${finalising ? 'animate-pulse' : ''}`} aria-hidden="true" />
                  {finalising ? 'Saving…' : 'Create event'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onClose} className="btn-secondary text-sm">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || finalising}
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
                      {submitting ? 'Extracting…' : 'Extract event'}
                    </>
                  )}
                </button>
              </>
            )}
          </footer>
        </div>
      </div>

      <LlmSettingsSheet open={keySheetOpen} onClose={() => setKeySheetOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// ReviewView — per-dish summary of what the LLM extracted and what to do with
// each one that didn't match a library recipe. Three actions for unmatched
// dishes: Create new / Ready to go / Search the recipe library.
// ---------------------------------------------------------------------------
function ReviewView({
  event,
  recipes,
  matches,
  choices,
  pickerOpenFor,
  onChoose,
  onTogglePicker,
  onPickRecipe,
  onUnlink,
  onCreateNew,
}: {
  event: KitchenEvent;
  recipes: Recipe[];
  matches: Record<string, Recipe | undefined>;
  choices: Record<string, ReviewChoice | undefined>;
  pickerOpenFor: string | null;
  onChoose: (dishId: string, choice: ReviewChoice) => void;
  onTogglePicker: (dishId: string) => void;
  onPickRecipe: (dishId: string, recipe: Recipe) => void;
  onUnlink: (dishId: string) => void;
  onCreateNew: (dishId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        <p className="font-medium text-slate-700 dark:text-slate-200 truncate">
          {event.title || 'Untitled event'}
        </p>
        {event.location && <p>📍 {event.location}</p>}
        {event.serveAt && <p>🕒 {new Date(event.serveAt).toLocaleString()}</p>}
      </div>

      <p className="text-xs text-slate-500">
        Dishes extracted from your text — pick what to do with each one before creating the event.
      </p>

      <ul className="space-y-2">
        {event.dishes.length === 0 && (
          <li className="text-sm text-slate-500 italic">No dishes detected in the text.</li>
        )}
        {event.dishes.map((d) => {
          const matched = matches[d.id];
          const choice = choices[d.id];
          const isPickerOpen = pickerOpenFor === d.id;
          // Red border = dish is neither linked to a library recipe nor marked
          // ready-to-go. "Create new recipe" still trips the warning because it
          // makes a stub the chef has to fill in later.
          const needsAttention = !matched && choice !== 'ready';
          return (
            <li
              key={d.id}
              className={[
                'rounded-md border p-3 space-y-2',
                needsAttention
                  ? 'border-red-500 dark:border-red-500 bg-red-50/40 dark:bg-red-900/10'
                  : 'border-slate-200 dark:border-slate-700',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm flex-1 truncate">
                  {d.name || '(untitled dish)'}
                </span>
                <span className="text-xs text-slate-500">
                  {d.portions} portion{d.portions === 1 ? '' : 's'}
                </span>
              </div>
              {matched ? (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 flex-1">
                    <BookOpen className="h-3 w-3" aria-hidden="true" />
                    Linked to recipe <span className="font-medium">{matched.title}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => onUnlink(d.id)}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
                  >
                    change
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => onCreateNew(d.id)}
                      className="text-xs flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      Create new recipe
                    </button>
                    <button
                      type="button"
                      onClick={() => onChoose(d.id, 'ready')}
                      className={`text-xs flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 ${
                        choice === 'ready'
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Hand className="h-3 w-3" aria-hidden="true" />
                      The dish is ready to go
                    </button>
                    <button
                      type="button"
                      onClick={() => onTogglePicker(d.id)}
                      className={`text-xs flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 ${
                        isPickerOpen
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      aria-expanded={isPickerOpen}
                    >
                      <Search className="h-3 w-3" aria-hidden="true" />
                      Search recipes
                    </button>
                  </div>
                  {isPickerOpen && (
                    <RecipePicker
                      recipes={recipes}
                      initialQuery={d.name}
                      onPick={(r) => onPickRecipe(d.id, r)}
                    />
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecipePicker — small inline filter + list. Seeded with the dish name so the
// user usually sees the right match on top without typing anything.
// ---------------------------------------------------------------------------
function RecipePicker({
  recipes,
  initialQuery,
  onPick,
}: {
  recipes: Recipe[];
  initialQuery: string;
  onPick: (recipe: Recipe) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const queryRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, []);
  const normQuery = query.toLowerCase().trim();
  const filtered = normQuery
    ? recipes.filter((r) => r.title.toLowerCase().includes(normQuery))
    : recipes;
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink">
      <div className="border-b border-slate-100 dark:border-slate-800 p-2">
        <input
          ref={queryRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter recipes by title…"
          className="input text-xs"
          aria-label="Filter recipes"
        />
      </div>
      {recipes.length === 0 ? (
        <p className="p-3 text-xs text-slate-500 italic">
          Your recipe library is empty — pick "Create new recipe" or "The dish is ready to go" instead.
        </p>
      ) : filtered.length === 0 ? (
        <p className="p-3 text-xs text-slate-500 italic">
          No recipes match "{query}".
        </p>
      ) : (
        <ul className="max-h-48 overflow-auto">
          {filtered.slice(0, 12).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <BookOpen className="h-3 w-3 text-slate-400" aria-hidden="true" />
                <span className="flex-1 truncate">{r.title}</span>
                <span className="text-[10px] text-slate-500">
                  {r.originalYield} portion{r.originalYield === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
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

function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (/401/.test(m)) return 'Invalid API key. Check your Groq key in settings.';
    if (/429/.test(m)) return 'Rate limited by Groq. Wait a minute and try again.';
    return m;
  }
  return String(err);
}

function buildBlankEvent(): KitchenEvent {
  const now = Date.now();
  return {
    id: randomId(),
    title: 'Untitled event',
    serveAt: undefined,
    notes: '',
    dishes: [],
    createdAt: now,
    updatedAt: now,
  };
}

// Case-insensitive, trim-normalised exact match on recipe title. Conservative
// on purpose: we'd rather offer "create new" than mis-link a dish to a
// vaguely-similar recipe.
function findRecipeMatch(dishName: string, recipes: readonly Recipe[]): Recipe | undefined {
  const norm = dishName.toLowerCase().trim();
  if (!norm) return undefined;
  return recipes.find((r) => r.title.toLowerCase().trim() === norm);
}
