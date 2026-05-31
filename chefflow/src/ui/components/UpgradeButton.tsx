import { Sparkles } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useTierStore } from '../../state/useTierStore';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

// Signed-in nav CTA. Always visible to authenticated chefs so the
// upgrade / plan-management entry point is one click away regardless
// of tier. Hidden for anonymous guests — they have the "Sign in"
// avatar slot; pushing a paid CTA before they have an account is too
// aggressive.
//
// Label is tier-aware:
//   free       → "Upgrade"                (opens UpgradeSheet → Pro / Enterprise)
//   pro        → "Upgrade to Enterprise"  (opens UpgradeSheet)
//   business   → "Upgrade to Enterprise"  (legacy intermediate tier — same target)
//   enterprise → "Manage plan"            (opens UpgradeSheet; chef can review / cancel)
//
// The UpgradeSheet itself decides what to show for each current tier;
// this button only controls the entry-point copy.
//
// T11 — styled as a nav row (h-10 icon + label) to match the Admin /
// Settings / Account rows in SideNav's footer block. Keeps an accent
// text colour so it still reads as a CTA against the muted slate rows.

interface TierCopy {
  label: string;
  ariaLabel: string;
}

const TIER_COPY: Record<string, TierCopy> = {
  free: { label: 'Upgrade', ariaLabel: 'Upgrade to Pro' },
  pro: { label: 'Upgrade to Enterprise', ariaLabel: 'Upgrade to Enterprise' },
  business: { label: 'Upgrade to Enterprise', ariaLabel: 'Upgrade to Enterprise' },
  enterprise: { label: 'Manage plan', ariaLabel: 'Manage your subscription' },
};

export default function UpgradeButton() {
  const tier = useTierStore((s) => s.tier);
  const openWith = useUpgradeSheetStore((s) => s.openWith);
  const { isSignedIn } = useUser();
  const isE2E = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
  if (!isE2E && !isSignedIn) return null;
  const copy = TIER_COPY[tier] ?? TIER_COPY.free;
  return (
    <button
      type="button"
      onClick={() => openWith('general')}
      aria-label={copy.ariaLabel}
      data-testid="nav-upgrade-button"
      className={[
        'flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium',
        'transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        // Accent colour keeps the upgrade CTA visually distinct from
        // the muted slate Admin / Settings / Account rows that bracket
        // it in the SideNav footer.
        'text-accent hover:bg-accent/10',
      ].join(' ')}
    >
      <Sparkles size={18} aria-hidden="true" />
      <span>{copy.label}</span>
    </button>
  );
}
