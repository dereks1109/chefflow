import { useEffect, useRef, useState } from 'react';
import { UserCog, X } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { savePrefs } from '../../db/prefsRepo';
import { useUnitSystemStore } from '../../state/unitSystemStore';
import type { UnitSystem, UserPrefs } from '../../core/types';

interface Props {
  open: boolean;
  onClose: () => void;
  // Pre-existing prefs row, if any. Used to prefill the form when the wizard
  // is re-opened from the user menu after onboarding has already happened.
  initialPrefs?: UserPrefs;
}

const ROLE_PRESETS = ['Head chef', 'Sous chef', 'Line cook', 'Home cook'] as const;
const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
  { value: 'auto', label: 'Auto' },
];

export default function AccountSetupSheet({ open, onClose, initialPrefs }: Props) {
  const { user } = useUser();
  const storeSystem = useUnitSystemStore((s) => s.system);
  const setStoreSystem = useUnitSystemStore((s) => s.setSystem);

  const clerkDefault = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<UnitSystem>('auto');
  const [role, setRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [saving, setSaving] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset form whenever the sheet opens — pulling fresh defaults from Clerk
  // and any existing prefs row (re-open case from the user menu).
  useEffect(() => {
    if (!open) return;
    setName(initialPrefs?.displayName ?? clerkDefault);
    setUnit(initialPrefs?.unitSystem ?? storeSystem);
    const existingRole = initialPrefs?.kitchenRole;
    if (existingRole && (ROLE_PRESETS as readonly string[]).includes(existingRole)) {
      setRole(existingRole);
      setCustomRole('');
    } else if (existingRole) {
      setRole('Other');
      setCustomRole(existingRole);
    } else {
      setRole('');
      setCustomRole('');
    }
    setSaving(false);
    setTimeout(() => firstInputRef.current?.focus(), 0);
  }, [open, initialPrefs, clerkDefault, storeSystem]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmedName = name.trim();
  const finalRole = role === 'Other' ? customRole.trim() : role;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      // Push unit system through the store so the existing userPrefsSync
      // subscription writes it into the same Dexie row (and queues one sync
      // push for everything). The explicit savePrefs below adds the other
      // wizard fields onto that row.
      setStoreSystem(unit);
      await savePrefs({
        unitSystem: unit,
        displayName: trimmedName || undefined,
        kitchenRole: finalRole || undefined,
        onboardedAt: Date.now(),
        // Clear the skipped flag if a previous session skipped and the user
        // is now completing the form.
        onboardSkippedAt: undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    if (saving) return;
    setSaving(true);
    try {
      await savePrefs({ onboardSkippedAt: Date.now() });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-setup-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 id="account-setup-title" className="font-semibold inline-flex items-center gap-2">
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Account setup
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

        <div className="px-5 py-4 space-y-6 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            A few quick choices so ChefFlow fits your kitchen.
          </p>

          <section className="space-y-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Display name</span>
              <input
                ref={firstInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Chen"
                autoComplete="name"
                className="input mt-1"
                aria-label="Display name"
              />
            </label>
          </section>

          <section className="space-y-2">
            <span className="text-xs font-medium text-slate-500">Unit system</span>
            <div role="radiogroup" aria-label="Unit system" className="flex gap-2">
              {UNIT_OPTIONS.map((opt) => {
                const selected = unit === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setUnit(opt.value)}
                    className={[
                      'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                      selected
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <span className="text-xs font-medium text-slate-500">Kitchen role</span>
            <div className="flex flex-wrap gap-2">
              {ROLE_PRESETS.map((preset) => {
                const selected = role === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRole(preset)}
                    className={[
                      'px-3 py-1.5 rounded-full border text-sm transition-colors',
                      selected
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400',
                    ].join(' ')}
                  >
                    {preset}
                  </button>
                );
              })}
              <button
                key="Other"
                type="button"
                aria-pressed={role === 'Other'}
                onClick={() => setRole('Other')}
                className={[
                  'px-3 py-1.5 rounded-full border text-sm transition-colors',
                  role === 'Other'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400',
                ].join(' ')}
              >
                Other
              </button>
            </div>
            {role === 'Other' && (
              <input
                type="text"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="Describe your role"
                className="input mt-1"
                aria-label="Custom kitchen role"
              />
            )}
          </section>
        </div>

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="btn-secondary text-sm disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
