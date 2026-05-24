import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { getPrefs, savePrefs } from '../../db/prefsRepo';

// One-time onboarding nudge that fires the first time the user lands on
// a page that surfaces AI-assisted allergen badges. Stays hidden once
// dismissed (allergenAdvisoryAckedAt set on UserPrefs, syncs cross-device).
// Caller is responsible for calling this with `enabled` true only when the
// surrounding page actually shows allergen-bearing content.

interface Props {
  enabled: boolean;
}

export default function AllergenAdvisoryBanner({ enabled }: Props) {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getPrefs().then((prefs) => {
      if (cancelled) return;
      if (!prefs?.allergenAdvisoryAckedAt && enabled) setVisible(true);
      setPending(false);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  if (pending || !visible || !enabled) return null;

  async function dismiss() {
    setVisible(false);
    try {
      await savePrefs({ allergenAdvisoryAckedAt: Date.now() });
    } catch {
      /* non-fatal — banner reappears next session if save failed */
    }
  }

  return (
    <div
      role="note"
      className="mb-4 rounded-md border border-amber-300 dark:border-amber-800/60
                 bg-amber-50/80 dark:bg-amber-900/15 px-4 py-3 text-sm
                 text-amber-900 dark:text-amber-200 flex items-start gap-3"
    >
      <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium">Allergen flags are AI-assisted.</p>
        <p className="mt-0.5 text-xs">
          ChefFlow draws allergen tags from the recipe text using an LLM. Always
          cross-check ingredients (and brand-specific labels) before serving guests
          with allergies. You — the chef — remain responsible for what reaches the plate.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void dismiss()}
        aria-label="Dismiss allergen advisory"
        className="text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
