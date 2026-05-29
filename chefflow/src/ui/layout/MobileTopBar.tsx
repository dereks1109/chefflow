import { NavLink } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { Mail, Settings, Shield } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import UpgradeButton from '../components/UpgradeButton';
import AccountAvatar from '../components/AccountAvatar';
import { useAdminStore } from '../../state/useAdminStore';

export default function MobileTopBar() {
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const { isSignedIn } = useUser();
  const clerk = useClerk();
  const isE2E = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
  const showSignedInChrome = isE2E || isSignedIn;
  return (
    <header
      className={[
        'lg:hidden',
        'print:!hidden',
        'sticky top-0 z-30',
        'h-14 w-full',
        'flex items-center gap-2 px-4',
        'bg-white/90 dark:bg-surface-0/90 backdrop-blur-md',
        'border-b border-slate-200 dark:border-[rgba(255,255,255,0.06)]',
      ].join(' ')}
    >
      <NavLink
        to="/recipes"
        aria-label="ChefFlow home"
        className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md px-1 py-1 hover:text-accent"
      >
        <BrandLogo showText textClassName="text-sm font-semibold" />
      </NavLink>

      <div className="ml-auto flex items-center gap-1">
        {isAdmin && (
          <NavLink
            to="/admin"
            aria-label="Admin"
            className={({ isActive }) =>
              [
                'flex items-center justify-center',
                'min-h-touch min-w-touch rounded-lg',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive
                  ? 'text-accent bg-accent/10'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-surface-3',
              ].join(' ')
            }
          >
            <Shield size={20} aria-hidden="true" />
          </NavLink>
        )}

        <UpgradeButton />

        {/* About link removed 2026-05-29 — `/about` is now the
            marketing landing at `/`; the logo click reaches it. */}

        <NavLink
          to="/contact"
          aria-label="Contact"
          className={({ isActive }) =>
            [
              'flex items-center justify-center',
              'min-h-touch min-w-touch rounded-lg',
              'transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              isActive
                ? 'text-accent bg-accent/10'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-surface-3',
            ].join(' ')
          }
        >
          <Mail size={20} aria-hidden="true" />
        </NavLink>

        <NavLink
          to="/settings"
          aria-label="Settings"
          className={({ isActive }) =>
            [
              'flex items-center justify-center',
              'min-h-touch min-w-touch rounded-lg',
              'transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              isActive
                ? 'text-accent bg-accent/10 dark:bg-accent/10'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-surface-3',
            ].join(' ')
          }
        >
          <Settings size={20} aria-hidden="true" />
        </NavLink>

        {showSignedInChrome ? (
          <NavLink
            to="/settings"
            aria-label="Account"
            title="Account"
            data-testid="mobile-account-avatar"
            className="flex items-center justify-center min-h-touch min-w-touch rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <AccountAvatar size={28} label="Account" />
          </NavLink>
        ) : (
          <button
            type="button"
            onClick={() => clerk.openSignIn?.()}
            aria-label="Sign in"
            title="Sign in"
            data-testid="mobile-sign-in"
            className="flex items-center justify-center min-h-touch min-w-touch rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <AccountAvatar size={28} isGuest label="Guest — sign in" />
          </button>
        )}
      </div>
    </header>
  );
}
