import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ChevronUp, Clock, Edit3, Hand, Plus, StickyNote, Trash2, Users, Wallet } from 'lucide-react';
import type { ColorTag, Dish, Recipe } from '../../core/types';
import { formatTime, toLocalInputValue, fromLocalInputValue } from '../../core/util/datetime';
import { formatGBP } from '../../core/util/money';
import ColorPicker from './ColorPicker';
import NotesList from './NotesList';

interface Props {
  index: number;
  value: Dish;
  reorderMode?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /**
   * Opens the full edit modal (e.g. DishForm). Optional — when the row is
   * mounted in a context that already exposes inline editors for every
   * field (e.g. EventView's timeline), omit this prop and the Edit3 button
   * is suppressed.
   */
  onEdit?: () => void;
  onRemove: () => void;
  onColorChange?: (color: ColorTag | undefined) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /**
   * Inline edit hook for the dish start-time. When provided, the clock text
   * becomes a button that swaps to a `<datetime-local>` input on click;
   * commit on blur/Enter, cancel on Esc. Omit to keep the time read-only —
   * callers in non-editable contexts (timelines, summaries) don't pass it.
   */
  onTimeChange?: (nextIsoStartAt: string) => void;
  /**
   * Inline edit hook for the dish name. When provided, the title text swaps
   * to a `<input type="text">` on click; commit on blur/Enter (only when
   * non-empty), cancel on Esc. Mirrors the time-edit pattern, including the
   * DnD stopPropagation guards.
   */
  onNameChange?: (next: string) => void;
  /**
   * Inline edit hook for portions. Click the "N portion(s)" text to swap to
   * a `<input type="number" min={1}>`. Values <= 1 clamp to 1 on commit;
   * non-finite input cancels (keeps current value). Commit on blur/Enter,
   * cancel on Esc.
   */
  onPortionsChange?: (next: number) => void;
  /**
   * Inline edit hook for notes. When notes exist, clicking the paragraph
   * swaps to an auto-sizing `<textarea>`. Commit on Enter (Shift+Enter adds
   * a newline), or on blur. Esc cancels. Saving an empty value passes ''
   * — callers decide whether to treat that as "clear notes" (typically by
   * normalising '' → undefined before persisting).
   */
  onNotesChange?: (next: string) => void;
  /**
   * Price per portion in GBP, looked up by the caller from the linked
   * recipe. When set, the row displays `£X.XX/portion` and a derived
   * `£Y total` (portions × pricePerPortion). When undefined, both cells
   * are omitted unless `onPricePerPortionChange` is also provided — in
   * which case an "+ Add price" affordance is shown.
   */
  pricePerPortion?: number;
  /**
   * Inline edit hook for price per portion. Mutates the LINKED RECIPE,
   * not the dish — there is no dish-level price field. Pass `undefined`
   * on commit to clear the recipe's price. Callers should warn the user
   * (via a tooltip on the cell) that the change applies to every event
   * using that recipe. Omit when the dish has no linked recipe to edit.
   */
  onPricePerPortionChange?: (next: number | undefined) => void;
  /**
   * Library of recipes available for the inline name autocomplete.
   * When provided alongside `onLinkRecipe`, the name editor surfaces a
   * dropdown of matching recipes (substring match on title, max 6).
   * Picking a match calls `onLinkRecipe` instead of `onNameChange`.
   * Omit to disable autocomplete — the input behaves as a plain text
   * field that commits via `onNameChange`.
   */
  recipes?: readonly Recipe[];
  /**
   * Called when the user picks a recipe from the name-edit dropdown.
   * The caller should set BOTH `dish.recipeId` and `dish.name` (the
   * recipe's title) so the row reflects the link immediately.
   */
  onLinkRecipe?: (recipe: Recipe) => void;
  /**
   * Called from the autocomplete dropdown when the chef typed a name with
   * no library match and chose "Create new recipe". The caller should
   * mint a stub Recipe (title = typed name), persist it, link the dish,
   * and refresh the local recipes list. Receives the typed name (trimmed).
   */
  onCreateNewRecipe?: (name: string) => void;
  /**
   * Called from the autocomplete dropdown when the chef picks
   * "Dish is ready to go" — the dish has no recipe but the chef will
   * bring it themselves. Caller should set isPrepared=true and clear
   * recipeId. Mirrors DishForm's `markPrepared`.
   */
  onMarkPrepared?: () => void;
}

export default function DishRow({
  index,
  value,
  reorderMode,
  canMoveUp,
  canMoveDown,
  onEdit,
  onRemove,
  onColorChange,
  onMoveUp,
  onMoveDown,
  onTimeChange,
  onNameChange,
  onPortionsChange,
  onNotesChange,
  pricePerPortion,
  onPricePerPortionChange,
  recipes,
  onLinkRecipe,
  onCreateNewRecipe,
  onMarkPrepared,
}: Props) {
  // Each inline-edit mode is independent so opening one doesn't disrupt the
  // others. They share the same stop-propagation guards to keep @hello-pangea/dnd
  // from picking up drags while the user is typing.
  const [editingTime, setEditingTime] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingPortions, setEditingPortions] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);

  // Controlled input value used while the name editor is open. Lets us
  // filter the recipe-autocomplete dropdown live as the user types and
  // keep the displayed value in sync with what they've typed.
  const [nameQuery, setNameQuery] = useState(value.name);
  // Reset the query each time the editor opens — keeps it pinned to the
  // current dish name if the user re-opens after a previous commit.
  useEffect(() => {
    if (editingName) setNameQuery(value.name);
  }, [editingName, value.name]);

  const recipeMatches = useMemo(() => {
    if (!recipes || !editingName) return [];
    const q = nameQuery.trim().toLowerCase();
    if (q.length === 0) return [];
    return recipes.filter((r) => r.title.toLowerCase().includes(q)).slice(0, 6);
  }, [recipes, editingName, nameQuery]);

  // Mirror DishForm: when query is meaningful and there's no exact match,
  // surface the "Create new" / "Ready to go" affordances alongside any
  // partial matches. Threshold of 2 chars avoids noise on single keystrokes.
  const trimmedQuery = nameQuery.trim();
  const hasExactMatch = recipeMatches.some(
    (r) => r.title.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const showNameActions =
    editingName &&
    trimmedQuery.length >= 2 &&
    !hasExactMatch &&
    (Boolean(onCreateNewRecipe) || Boolean(onMarkPrepared));

  function pickRecipe(r: Recipe) {
    if (!onLinkRecipe) return;
    onLinkRecipe(r);
    setEditingName(false);
  }

  function pickCreateNew() {
    if (!onCreateNewRecipe || trimmedQuery.length === 0) return;
    onCreateNewRecipe(trimmedQuery);
    setEditingName(false);
  }

  function pickMarkPrepared() {
    if (!onMarkPrepared) return;
    onMarkPrepared();
    setEditingName(false);
  }

  const timeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const portionsInputRef = useRef<HTMLInputElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTime) timeInputRef.current?.focus();
  }, [editingTime]);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  useEffect(() => {
    if (editingPortions) {
      portionsInputRef.current?.focus();
      portionsInputRef.current?.select();
    }
  }, [editingPortions]);

  useEffect(() => {
    if (editingNotes) {
      const ta = notesTextareaRef.current;
      if (ta) {
        ta.focus();
        // Place cursor at end and auto-size to content height.
        ta.selectionStart = ta.value.length;
        ta.selectionEnd = ta.value.length;
        autosize(ta);
      }
    }
  }, [editingNotes]);

  useEffect(() => {
    if (editingPrice) {
      priceInputRef.current?.focus();
      priceInputRef.current?.select();
    }
  }, [editingPrice]);

  function commitTime(raw: string) {
    if (!onTimeChange) {
      setEditingTime(false);
      return;
    }
    const next = fromLocalInputValue(raw);
    if (next && next !== value.startAt) onTimeChange(next);
    setEditingTime(false);
  }

  function commitName(raw: string) {
    if (!onNameChange) {
      setEditingName(false);
      return;
    }
    const trimmed = raw.trim();
    // Only persist when the value actually changed AND is non-empty —
    // an empty name would render "Untitled dish" and is almost never
    // intentional, so we drop the commit instead.
    if (trimmed.length > 0 && trimmed !== value.name) onNameChange(trimmed);
    setEditingName(false);
  }

  function commitPortions(raw: string) {
    if (!onPortionsChange) {
      setEditingPortions(false);
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const clamped = Math.max(1, Math.floor(n));
      if (clamped !== value.portions) onPortionsChange(clamped);
    }
    setEditingPortions(false);
  }

  function commitNotes(raw: string) {
    if (!onNotesChange) {
      setEditingNotes(false);
      return;
    }
    if (raw !== (value.notes ?? '')) onNotesChange(raw);
    setEditingNotes(false);
  }

  function commitPrice(raw: string) {
    if (!onPricePerPortionChange) {
      setEditingPrice(false);
      return;
    }
    const trimmed = raw.trim();
    // Empty string clears the price (recipe.pricePerPortion → undefined).
    if (trimmed.length === 0) {
      if (pricePerPortion !== undefined) onPricePerPortionChange(undefined);
      setEditingPrice(false);
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0 && n !== pricePerPortion) {
      onPricePerPortionChange(n);
    }
    setEditingPrice(false);
  }

  return (
    <li
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-3"
      data-testid="dish-row"
      data-dish-id={value.id}
    >
      <div className="flex items-start gap-3">
        <span className="text-xs font-semibold text-slate-500 w-6 pt-1">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          {/* Single-row layout: time · name (+ recipe link / ready badge) ·
              portions · £/portion · £ total. Notes ride on the row below. */}
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-slate-600 dark:text-slate-400">
            {/* Time — HH:MM display, datetime-local editor (dish can fall
                on a different day from the event's serveAt). */}
            <div className="inline-flex items-center gap-1 font-mono">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {editingTime && onTimeChange ? (
                <input
                  ref={timeInputRef}
                  type="datetime-local"
                  defaultValue={toLocalInputValue(value.startAt)}
                  onBlur={(e) => commitTime(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitTime(e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingTime(false);
                    }
                    // Block keys propagating to DnD's keyboard sensors.
                    e.stopPropagation();
                  }}
                  // Stop the drag sensor picking up clicks/drags inside the input.
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="text-xs bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-accent focus:outline-none px-1 py-0.5"
                  aria-label={`Start time for dish ${index + 1}`}
                />
              ) : onTimeChange ? (
                <button
                  type="button"
                  onClick={() => setEditingTime(true)}
                  className="hover:text-accent hover:underline focus:outline-none focus:underline"
                  aria-label={`Edit start time for dish ${index + 1}`}
                  title="Click to edit start time"
                >
                  {formatTime(value.startAt)}
                </button>
              ) : (
                <span>{formatTime(value.startAt)}</span>
              )}
            </div>

            {/* Name — promoted in size; recipe link + ready badge stay
                attached so they read as a single unit. When editing, the
                input is controlled so the recipe-search dropdown can
                filter live as the chef types. */}
            <div className="inline-flex items-center gap-2 min-w-0 relative">
              {editingName && onNameChange ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  onBlur={(e) => commitName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitName(e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingName(false);
                    }
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100 bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-accent focus:outline-none px-1 py-0.5 min-w-0"
                  aria-label={`Dish ${index + 1} name`}
                  placeholder="Dish name"
                  autoComplete="off"
                />
              ) : onNameChange ? (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100 text-left hover:text-accent hover:underline focus:outline-none focus:underline truncate"
                  aria-label={`Edit name for dish ${index + 1}`}
                  title="Click to edit dish name"
                >
                  {value.name || 'Untitled dish'}
                </button>
              ) : (
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {value.name || 'Untitled dish'}
                </h3>
              )}
              {value.recipeId && (
                <Link
                  to={`/recipes/${value.recipeId}/edit`}
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline shrink-0"
                >
                  <BookOpen className="h-3 w-3" aria-hidden="true" />
                  recipe
                </Link>
              )}
              {value.isPrepared && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500 shrink-0">
                  <Hand className="h-3 w-3" aria-hidden="true" />
                  ready
                </span>
              )}
              {/* Recipe-name autocomplete — mirrors DishForm's full
                  behaviour: matching library recipes appear as clickable
                  rows; if the chef typed a name without an exact match,
                  the "Create new recipe" + "Dish is ready to go"
                  affordances appear below. Each row uses
                  onMouseDown.preventDefault so the input's blur doesn't
                  fire before the click registers. */}
              {editingName &&
                (recipeMatches.length > 0 || showNameActions) && (
                  <ul
                    className="absolute top-full left-0 z-20 mt-1 w-72 max-w-[18rem] max-h-64 overflow-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-lg"
                    role="listbox"
                    aria-label={`Recipe suggestions for dish ${index + 1}`}
                  >
                    {recipeMatches.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickRecipe(r)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <BookOpen className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          <span className="flex-1 truncate">{r.title}</span>
                          <span className="text-xs text-slate-500 shrink-0">
                            {r.originalYield} portion{r.originalYield === 1 ? '' : 's'}
                          </span>
                        </button>
                      </li>
                    ))}
                    {showNameActions && onCreateNewRecipe && (
                      <li className={recipeMatches.length > 0 ? 'border-t border-slate-200 dark:border-slate-700' : ''}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={pickCreateNew}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Plus className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          <span className="flex-1 truncate">
                            Create new recipe: <span className="font-medium text-slate-700 dark:text-slate-200">{trimmedQuery}</span>
                          </span>
                        </button>
                      </li>
                    )}
                    {showNameActions && onMarkPrepared && (
                      <li>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={pickMarkPrepared}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Hand className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          <span className="flex-1 truncate">The dish is ready to go</span>
                        </button>
                      </li>
                    )}
                  </ul>
                )}
            </div>

            {/* Portions — click to edit. */}
            <div className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden="true" />
              {editingPortions && onPortionsChange ? (
                <input
                  ref={portionsInputRef}
                  type="number"
                  min={1}
                  defaultValue={value.portions}
                  onBlur={(e) => commitPortions(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitPortions(e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingPortions(false);
                    }
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-16 text-xs bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-accent focus:outline-none px-1 py-0.5"
                  aria-label={`Portions for dish ${index + 1}`}
                />
              ) : onPortionsChange ? (
                <button
                  type="button"
                  onClick={() => setEditingPortions(true)}
                  className="hover:text-accent hover:underline focus:outline-none focus:underline"
                  aria-label={`Edit portions for dish ${index + 1}`}
                  title="Click to edit portions"
                >
                  {value.portions} portion{value.portions === 1 ? '' : 's'}
                </button>
              ) : (
                <span>{value.portions} portion{value.portions === 1 ? '' : 's'}</span>
              )}
            </div>

            {/* Price / portion — sourced from the linked recipe. Editable
                in place when onPricePerPortionChange is provided; writes back
                to the recipe (NOT a dish-level override), so the change
                propagates to every event using that recipe. */}
            {(pricePerPortion !== undefined || onPricePerPortionChange) && (
              <div
                className="inline-flex items-center gap-1"
                title={
                  onPricePerPortionChange
                    ? 'Edits the linked recipe — change applies to every event using it'
                    : 'Price per portion (from the linked recipe)'
                }
              >
                <Wallet className="h-3 w-3" aria-hidden="true" />
                {editingPrice && onPricePerPortionChange ? (
                  <input
                    ref={priceInputRef}
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={pricePerPortion ?? ''}
                    onBlur={(e) => commitPrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitPrice(e.currentTarget.value);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingPrice(false);
                      }
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="w-20 text-xs bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-accent focus:outline-none px-1 py-0.5"
                    aria-label={`Price per portion for dish ${index + 1} (GBP)`}
                    placeholder="0.00"
                  />
                ) : onPricePerPortionChange ? (
                  <button
                    type="button"
                    onClick={() => setEditingPrice(true)}
                    className="hover:text-accent hover:underline focus:outline-none focus:underline"
                    aria-label={`Edit price per portion for dish ${index + 1}`}
                    title="Click to edit price per portion"
                  >
                    {pricePerPortion !== undefined
                      ? `${formatGBP(pricePerPortion)}/portion`
                      : '+ Add price'}
                  </button>
                ) : (
                  <span>{formatGBP(pricePerPortion as number)}/portion</span>
                )}
              </div>
            )}

            {/* Total — portions × pricePerPortion. Read-only (derived). */}
            {pricePerPortion !== undefined && (
              <div
                className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200"
                title="Portions × price per portion"
              >
                <span>{formatGBP(pricePerPortion * value.portions)} total</span>
              </div>
            )}
          </div>
          {/* Notes block:
              - editing → autosized textarea (Enter commits, Shift+Enter newline)
              - notes present + onNotesChange → clickable region wrapping NotesList
              - notes present, no handler → plain NotesList (existing behavior)
              - notes absent + onNotesChange → "+ Add note" affordance
              - notes absent, no handler → render nothing */}
          {editingNotes && onNotesChange ? (
            <textarea
              ref={notesTextareaRef}
              defaultValue={value.notes ?? ''}
              onBlur={(e) => commitNotes(e.target.value)}
              onChange={(e) => autosize(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitNotes(e.currentTarget.value);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingNotes(false);
                }
                e.stopPropagation();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="mt-2 w-full text-sm bg-transparent border border-slate-300 dark:border-slate-600 rounded focus:border-accent focus:outline-none px-2 py-1 resize-none"
              rows={1}
              aria-label={`Notes for dish ${index + 1}`}
              placeholder="Notes (Enter to save, Shift+Enter for newline, Esc to cancel)"
            />
          ) : value.notes && onNotesChange ? (
            // Clickable region wrapping a NotesList — using <div role="button">
            // rather than <button> because <button> can't legally contain the
            // block-level <ul> NotesList renders for multi-line notes.
            <div
              role="button"
              tabIndex={0}
              onClick={() => setEditingNotes(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEditingNotes(true);
                }
              }}
              className="mt-2 text-sm text-slate-600 dark:text-slate-400 hover:text-accent focus:outline-none focus:text-accent cursor-text"
              aria-label={`Edit notes for dish ${index + 1}`}
              title="Click to edit notes"
            >
              <NotesList notes={value.notes} />
            </div>
          ) : value.notes ? (
            <NotesList
              notes={value.notes}
              className="mt-2 text-sm text-slate-600 dark:text-slate-400"
            />
          ) : onNotesChange ? (
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-accent focus:outline-none focus:text-accent"
              aria-label={`Add notes for dish ${index + 1}`}
              title="Add a note for this dish"
            >
              <StickyNote className="h-3 w-3" aria-hidden="true" />
              + Add note
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {reorderMode ? (
            <>
              <button
                type="button"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                className="touch-target px-2 rounded-md text-slate-500 hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={`Move dish ${index + 1} up`}
              >
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={!canMoveDown}
                className="touch-target px-2 rounded-md text-slate-500 hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={`Move dish ${index + 1} down`}
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              {onColorChange && (
                <ColorPicker
                  value={value.colorTag}
                  onChange={onColorChange}
                  label={`Color tag for dish ${index + 1}`}
                />
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="touch-target px-2 rounded-md text-slate-500 hover:text-accent"
                  aria-label={`Edit dish ${index + 1}`}
                  data-testid="dish-row-edit"
                >
                  <Edit3 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={onRemove}
                className="touch-target px-2 rounded-md text-slate-500 hover:text-danger"
                aria-label={`Remove dish ${index + 1}`}
                data-testid="dish-row-remove"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// Auto-size a textarea to its content. Resets height before measuring so the
// element shrinks as well as grows. Called on focus and on every change.
function autosize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
