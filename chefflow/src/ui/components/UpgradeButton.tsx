import { Sparkles } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useTierStore } from '../../state/useTierStore';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

// Free-tier-only nav CTA. Opens the UpgradeSheet with the un-prompted
// 'general' reason (chef hasn't tripped a cap). Mounted in TopNav +
// MobileTopBar right clusters. Hidden for anonymous users — the "Sign in"
// button sits in their slot instead.

export default function UpgradeButton() {
  const tier = useTierStore((s) => s.tier);
  const openWith = useUpgradeSheetStore((s) => s.openWith);
  const { isSignedIn } = useUser();
  const isE2E = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
  if (!isE2E && !isSignedIn) return null;
  if (tier !== 'free') return null;
  return (
    <button
      type="button"
      onClick={() => openWith('general')}
      aria-label="Upgrade to Pro"
      data-testid="nav-upgrade-button"
      className={[
        'inline-flex items-center gap-1.5',
        'px-2.5 h-7 rounded-full',
        'text-xs font-semibold',
        'bg-accent text-white hover:bg-accent/90',
        'transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      <Sparkles size={13} aria-hidden="true" />
      <span>Upgrade</span>
    </button>
  );
}
