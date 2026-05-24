import { User } from 'lucide-react';
import { useProfileStore } from '../../state/useProfileStore';

interface Props {
  /** CSS pixels for the avatar diameter. Default 28 (matches a min-touch
   *  target without dominating the nav row). */
  size?: number;
  /** Aria label override — defaults to "Account". */
  label?: string;
  /** Signed-out branch: render a grey placeholder so the nav always has an
   *  identity slot. The wrapper (TopNav / MobileTopBar) opens the sign-in
   *  modal on click. */
  isGuest?: boolean;
}

/**
 * Tiny circular avatar used in the top nav + mobile bar. Three branches:
 *  1. Guest → grey User icon over a slate circle (identity placeholder).
 *  2. Signed-in with avatarDataUrl → the chef's uploaded photo.
 *  3. Signed-in without avatar → single-letter initial on an accent circle.
 *
 * Mirrors the larger initials-fallback already in [SettingsPage.tsx:191-211]
 * so the visual treatment is consistent between the nav chip and the in-page
 * profile editor.
 */
export default function AccountAvatar({ size = 28, label, isGuest }: Props) {
  // Hooks must run unconditionally; guest branch ignores the store values.
  const avatarDataUrl = useProfileStore((s) => s.avatarDataUrl);
  const displayName = useProfileStore((s) => s.displayName);
  const dim = { width: size, height: size };

  if (isGuest) {
    const iconSize = Math.max(12, Math.round(size * 0.6));
    return (
      <span
        role="img"
        aria-label={label ?? 'Guest — sign in'}
        style={dim}
        className="inline-flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500"
        data-testid="account-avatar-guest"
      >
        <User style={{ width: iconSize, height: iconSize }} aria-hidden="true" />
      </span>
    );
  }

  const initial = (displayName?.trim().charAt(0) || '?').toUpperCase();
  const fontSize = Math.max(10, Math.round(size * 0.42));

  if (avatarDataUrl) {
    return (
      <img
        src={avatarDataUrl}
        alt={label ?? 'Account'}
        style={dim}
        className="rounded-full object-cover border border-slate-200 dark:border-slate-700"
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={label ?? 'Account'}
      style={{ ...dim, fontSize }}
      className="inline-flex items-center justify-center rounded-full bg-accent/15 text-accent font-semibold"
    >
      {initial}
    </span>
  );
}
