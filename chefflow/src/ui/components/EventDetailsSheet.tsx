import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Mail,
  MapPin,
  Phone,
  Settings2,
  StickyNote,
  User,
  Wallet,
  X,
} from 'lucide-react';
import LocationAutocomplete from './LocationAutocomplete';
import { toLocalInputValue, fromLocalInputValue } from '../../core/util/datetime';
import type { KitchenEvent } from '../../core/types';

// ---------------------------------------------------------------------------
// EventDetailsSheet — a focused modal for editing event *metadata* only
// (title, date/time, location, contact, budget, notes). It deliberately
// excludes dishes and sections; those still belong in the full editor at
// /events/:id/edit (linked from the footer for completeness).
//
// Pattern mirrors GenerateRecipeSheet:
//   - Backdrop click closes
//   - Esc closes
//   - Dialog body stopPropagation
// Confirm-on-unsaved-changes mirrors EventEditor.handleCancel.
// ---------------------------------------------------------------------------
interface Props {
  open: boolean;
  event: KitchenEvent;
  onClose: () => void;
  onSave: (next: KitchenEvent) => void | Promise<void>;
}

// Local form state — narrow to the fields this sheet edits. Optional fields
// are normalised to '' for inputs and re-normalised back to undefined when
// blank on save (mirrors EventEditor's `value || undefined` idiom).
interface FormState {
  title: string;
  serveAt: string; // ISO or ''
  location: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  budget: string; // raw input string so '' / partial typing is preserved
  notes: string;
}

function eventToForm(e: KitchenEvent): FormState {
  return {
    title: e.title,
    serveAt: e.serveAt ?? '',
    location: e.location ?? '',
    contactName: e.contactName ?? '',
    contactEmail: e.contactEmail ?? '',
    contactPhone: e.contactPhone ?? '',
    budget: e.budget !== undefined ? String(e.budget) : '',
    notes: e.notes,
  };
}

function formsEqual(a: FormState, b: FormState): boolean {
  return (
    a.title === b.title &&
    a.serveAt === b.serveAt &&
    a.location === b.location &&
    a.contactName === b.contactName &&
    a.contactEmail === b.contactEmail &&
    a.contactPhone === b.contactPhone &&
    a.budget === b.budget &&
    a.notes === b.notes
  );
}

function applyForm(base: KitchenEvent, f: FormState): KitchenEvent {
  // Re-normalise: optional strings become undefined when blank;
  // budget parses to a finite non-negative number or undefined.
  let budget: number | undefined;
  const raw = f.budget.trim();
  if (raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) budget = n;
  }
  return {
    ...base,
    title: f.title,
    serveAt: f.serveAt || undefined,
    location: f.location.trim() || undefined,
    contactName: f.contactName.trim() || undefined,
    contactEmail: f.contactEmail.trim() || undefined,
    contactPhone: f.contactPhone.trim() || undefined,
    budget,
    notes: f.notes,
  };
}

export default function EventDetailsSheet({ open, event, onClose, onSave }: Props) {
  // `initial` is the form snapshot at open-time — used for dirty checking on
  // cancel. We reset it every time the sheet opens against a (possibly newly
  // saved) event so subsequent edits are diff'd against the latest baseline.
  const [initial, setInitial] = useState<FormState>(() => eventToForm(event));
  const [form, setForm] = useState<FormState>(() => eventToForm(event));
  const [saving, setSaving] = useState(false);

  // Whenever the sheet opens, re-seed both snapshots from the latest event.
  // Closing doesn't reset (keeps the form briefly stable during exit anim).
  useEffect(() => {
    if (open) {
      const seed = eventToForm(event);
      setInitial(seed);
      setForm(seed);
      setSaving(false);
    }
  }, [open, event]);

  // Esc closes — mirrors GenerateRecipeSheet. Dirty-guard runs in handleClose.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form, initial]);

  if (!open) return null;

  function handleClose() {
    if (saving) return;
    if (!formsEqual(form, initial)) {
      if (!window.confirm('Discard unsaved changes?')) return;
    }
    onClose();
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(applyForm(event, form));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-details-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-kitchen-ink z-10">
          <h2 id="event-details-title" className="font-semibold inline-flex items-center gap-2">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Event details
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="touch-target px-2 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <form
          className="px-5 py-4 space-y-5"
          onSubmit={(ev) => {
            ev.preventDefault();
            void handleSave();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium">Event title</span>
            <input
              type="text"
              value={form.title}
              onChange={(ev) => setForm({ ...form, title: ev.target.value })}
              className="input mt-1"
              placeholder="e.g. Sunday family dinner"
              aria-label="Event title"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Date & time
            </span>
            <input
              type="datetime-local"
              value={toLocalInputValue(form.serveAt)}
              onChange={(ev) =>
                setForm({ ...form, serveAt: fromLocalInputValue(ev.target.value) ?? '' })
              }
              className="input mt-1"
              aria-label="Event date and time"
            />
          </label>

          <div>
            <span className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Location
            </span>
            <div className="mt-1">
              <LocationAutocomplete
                value={form.location}
                onChange={(v) => setForm({ ...form, location: v })}
                placeholder="Start typing an address — Google Places suggestions appear inline"
                ariaLabel="Event location"
              />
            </div>
          </div>

          <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <legend className="sr-only">Contact</legend>
            <label className="block">
              <span className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" aria-hidden="true" />
                Contact name
              </span>
              <input
                type="text"
                value={form.contactName}
                onChange={(ev) => setForm({ ...form, contactName: ev.target.value })}
                className="input mt-1"
                aria-label="Contact name"
                placeholder="e.g. Alex Johnson"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4" aria-hidden="true" />
                Email
              </span>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(ev) => setForm({ ...form, contactEmail: ev.target.value })}
                className="input mt-1"
                aria-label="Contact email"
                placeholder="alex@example.com"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" aria-hidden="true" />
                Phone
              </span>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(ev) => setForm({ ...form, contactPhone: ev.target.value })}
                className="input mt-1"
                aria-label="Contact phone"
                placeholder="+44 7700 900123"
              />
            </label>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" aria-hidden="true" />
              Budget (£) — optional
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.budget}
              onChange={(ev) => setForm({ ...form, budget: ev.target.value })}
              placeholder="—"
              className="input mt-1"
              aria-label="Event budget in GBP"
            />
            <span className="block mt-1 text-xs text-slate-500">
              Compared against the total of priced dishes during the menu suitability check.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium flex items-center gap-2">
              <StickyNote className="h-4 w-4" aria-hidden="true" />
              Notes / dietary requirements
            </span>
            <textarea
              value={form.notes}
              onChange={(ev) => setForm({ ...form, notes: ev.target.value })}
              className="input mt-1"
              rows={4}
              placeholder="e.g. 3 vegans, 1 peanut allergy, 2 gluten-free · plus any other notes for this event"
              aria-label="Event notes"
            />
            <span className="block mt-1 text-xs text-slate-500">
              The dietary signal here drives the menu suitability check on the event page.
            </span>
          </label>
        </form>

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-kitchen-ink">
          {/* Advanced editor link — sections / dish drag-and-drop only live in
              the full editor, so we keep that path discoverable from here. */}
          <Link
            to={`/events/${event.id}/edit`}
            className="text-xs text-slate-500 hover:text-accent hover:underline inline-flex items-center gap-1"
            onClick={(ev) => {
              if (!formsEqual(form, initial)) {
                if (!window.confirm('Discard unsaved changes?')) {
                  ev.preventDefault();
                  return;
                }
              }
              onClose();
            }}
          >
            Advanced (sections, dishes)
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="btn-secondary text-sm disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
