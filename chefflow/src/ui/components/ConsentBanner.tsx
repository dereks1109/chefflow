import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';
import Button from './primitives/Button';
import { useConsentStore, isBannerVisible } from '../../state/consentStore';

// UK PECR-compliant consent surface. Reject is the same prominence as Accept,
// no pre-ticked non-essential boxes, and an inline "Customise" path so the
// user never has to leave the page to opt out of a category.

export default function ConsentBanner() {
  const visible = useConsentStore(isBannerVisible);
  const categories = useConsentStore((s) => s.categories);
  const acceptAll = useConsentStore((s) => s.acceptAll);
  const rejectNonEssential = useConsentStore((s) => s.rejectNonEssential);
  const setCategories = useConsentStore((s) => s.setCategories);
  const closeBanner = useConsentStore((s) => s.closeBanner);

  const [showDetails, setShowDetails] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(categories.analytics);
  const [draftPreferences, setDraftPreferences] = useState(categories.preferences);
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (visible) {
      setDraftAnalytics(categories.analytics);
      setDraftPreferences(categories.preferences);
      setTimeout(() => acceptRef.current?.focus(), 0);
    } else {
      setShowDetails(false);
    }
  }, [visible, categories.analytics, categories.preferences]);

  // Esc treated as "reject non-essential" — sensible default that doesn't grant
  // anything by accident. Matches the ICO guidance that exiting must not imply
  // consent.
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') rejectNonEssential();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, rejectNonEssential]);

  if (!visible) return null;

  function handleSaveCustom() {
    setCategories({ analytics: draftAnalytics, preferences: draftPreferences });
  }

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:pb-4 lg:px-6 pointer-events-none"
    >
      <div
        className={[
          'pointer-events-auto mx-auto w-full max-w-3xl',
          'rounded-xl border border-[rgba(255,255,255,0.08)]',
          'bg-white text-slate-800 shadow-2xl',
          'dark:bg-surface-1 dark:text-slate-100',
          'mb-20 lg:mb-0',
        ].join(' ')}
      >
        <div className="flex items-start gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <Cookie className="hidden sm:block h-5 w-5 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex-1 min-w-0 space-y-2 text-sm">
            <p>
              <strong className="font-semibold">We use cookies.</strong> ChefFlow needs a few
              strictly-necessary cookies to keep you signed in. We may optionally remember theme
              and unit-system preferences, and we reserve an analytics category for future use —
              neither is loaded today. See our{' '}
              <Link to="/privacy" className="underline hover:text-accent">
                privacy policy
              </Link>{' '}
              and{' '}
              <Link to="/cookies" className="underline hover:text-accent">
                cookie policy
              </Link>
              .
            </p>

            {showDetails && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 mt-3">
                <CategoryRow
                  title="Strictly necessary"
                  description="Clerk session token and other auth essentials. Always on — sign-in won't work without these."
                  checked
                  disabled
                />
                <CategoryRow
                  title="Preferences"
                  description="Remembers theme and unit-system choices between visits. Functional but not strictly required."
                  checked={draftPreferences}
                  onChange={setDraftPreferences}
                />
                <CategoryRow
                  title="Analytics"
                  description="Anonymous usage metrics. None loaded today; reserved for future."
                  checked={draftAnalytics}
                  onChange={setDraftAnalytics}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {showDetails ? (
                <>
                  <Button size="sm" variant="primary" onClick={handleSaveCustom}>
                    Save preferences
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowDetails(false)}>
                    Back
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    ref={acceptRef}
                    size="sm"
                    variant="primary"
                    onClick={acceptAll}
                  >
                    Accept all
                  </Button>
                  <Button size="sm" variant="secondary" onClick={rejectNonEssential}>
                    Reject non-essential
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowDetails(true)}
                  >
                    Customise
                  </Button>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss (rejects non-essential)"
            onClick={rejectNonEssential}
            className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* Hidden trigger lets the close button also propagate to focus the next interactive element */}
      <button type="button" className="sr-only" onClick={closeBanner} aria-hidden="true" tabIndex={-1}>
        close
      </button>
    </div>
  );
}

interface CategoryRowProps {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}

function CategoryRow({ title, description, checked, disabled, onChange }: CategoryRowProps) {
  return (
    <label className="flex items-start justify-between gap-3 px-3 py-2 cursor-pointer">
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 h-4 w-4 accent-accent"
        aria-label={title}
      />
    </label>
  );
}
