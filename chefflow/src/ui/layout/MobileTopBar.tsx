import { NavLink } from 'react-router-dom';
import { UserButton, useClerk, useUser } from '@clerk/clerk-react';
import { LogIn, Settings, Shield } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import UsageMeter from '../components/UsageMeter';
import UpgradeButton from '../components/UpgradeButton';
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

        <NavLink
          to="/about"
          className={({ isActive }) =>
            [
              'flex items-center px-2 h-9 rounded-md text-sm font-medium',
              'transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              isActive
                ? 'text-accent'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            ].join(' ')
          }
        >
          About
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

        <UsageMeter />

        {!isE2E && showSignedInChrome && (
          <div className="flex items-center justify-center min-h-touch min-w-touch">
            <UserButton afterSignOutUrl="/" />
          </div>
        )}
        {!isE2E && !showSignedInChrome && (
          <button
            type="button"
            onClick={() => clerk.openSignIn?.()}
            data-testid="mobile-sign-in"
            aria-label="Sign in"
            className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90"
          >
            <LogIn size={16} aria-hidden="true" />
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
