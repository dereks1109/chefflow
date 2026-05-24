import { useProfileStore } from '../../state/useProfileStore';

interface Props {
  /** CSS pixels for the avatar diameter. Default 28 (matches a min-touch
   *  target without dominating the nav row). */
  size?: number;
  /** Aria label override — defaults to "Account". */
  label?: string;
}

/**
 * Tiny circular avatar used in the top nav + mobile bar. Renders the chef's
 * uploaded photo from `useProfileStore.avatarDataUrl` when present; otherwise
 * falls back to a single-letter initial drawn over an accent-tinted circle.
 *
 * Mirrors the larger initials-fallback already in [SettingsPage.tsx:191-211]
 * so the visual treatment is consistent between the nav chip and the in-page
 * profile editor.
 */
export default function AccountAvatar({ size = 28, label }: Props) {
  const avatarDataUrl = useProfileStore((s) => s.avatarDataUrl);
  const displayName = useProfileStore((s) => s.displayName);

  const initial = (displayName?.trim().charAt(0) || '?').toUpperCase();
  const dim = { width: size, height: size };
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
