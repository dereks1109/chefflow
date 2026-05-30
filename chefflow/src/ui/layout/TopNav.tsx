import { NavLink } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { BookOpen, CalendarDays, Globe2, ListChecks, Mail, Settings, Shield, Users } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import UpgradeButton from '../components/UpgradeButton';
import AccountAvatar from '../components/AccountAvatar';
import { useAdminStore } from '../../state/useAdminStore';
import { useTierStore } from '../../state/useTierStore';

// About link removed 2026-05-29: `/about` content is now the
// marketing landing at `/` (LandingOrRedirect in App.tsx). Logo
// click takes signed-in chefs to /recipes and guests to the
// landing — same destinations the About link used to reach.
//
// Teams link (T5) sits between Workflows and Community, gated to
// Enterprise tier — non-Enterprise chefs don't see a dead-end nav
// entry.
const BASE_NAV_ITEMS = [
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/workflows', label: 'Workflows', icon: ListChecks },
  { to: '/community', label: 'Community', icon: Globe2 },
  { to: '/contact', label: 'Contact', icon: Mail },
];

export default function TopNav() {
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const tier = useTierStore((s) => s.tier);
  const { isSignedIn } = useUser();
  const clerk = useClerk();
  const isE2E = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
  const navItems = tier === 'enterprise'
    ? [
        ...BASE_NAV_ITEMS.slice(0, 3),
        { to: '/teams', label: 'Teams', icon: Users },
        ...BASE_NAV_ITEMS.slice(3),
      ]
    : BASE_NAV_ITEMS;
  // In E2E mode we treat the app as always-signed-in so the existing
  // Playwright suite (which doesn't run Clerk) still sees the avatar slot.
  const showSignedInChrome = isE2E || isSignedIn;
  return (
    <header
      className={[
        'hidden lg:flex',
        'print:!hidden',
        'sticky top-0 z-30',
        'h-14 w-full',
        'items-center gap-4 px-6',
        'bg-surface-0/80 backdrop-blur-md',
        'border-b border-[rgba(255,255,255,0.06)]',
        'dark:bg-surface-0/80',
        'light:bg-white/90 light:border-slate-200',
      ].join(' ')}
    >
      <NavLink
        to="/recipes"
        aria-label="ChefFlow home"
        className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md px-1 py-1 hover:text-accent"
      >
        <BrandLogo showText textClassName="text-sm font-semibold" />
      </NavLink>

      <nav aria-label="Primary" className="flex items-center gap-1 ml-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={`nav-${to.slice(1)}`}
            className={({ isActive }) =>
              [
                'flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-surface-3',
              ].join(' ')
            }
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {isAdmin && (
          <NavLink
            to="/admin"
            aria-label="Admin dashboard"
            className={({ isActive }) =>
              [
                'flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-surface-3',
              ].join(' ')
            }
          >
            <Shield size={16} aria-hidden="true" />
            Admin
          </NavLink>
        )}

        <UpgradeButton />

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
                ? 'text-accent bg-accent/10'
                : 'text-slate-400 hover:text-slate-100 hover:bg-surface-3',
            ].join(' ')
          }
        >
          <Settings size={20} aria-hidden="true" />
        </NavLink>

        {/* Account avatar — always rendered so the top nav has an identity
            slot in every state. Signed-in: tap navigates to Settings. Guest:
            tap opens the Clerk sign-in modal. E2E mode short-circuits to the
            signed-in branch so Playwright tests still see the avatar. */}
        {showSignedInChrome ? (
          <NavLink
            to="/settings"
            aria-label="Account"
            title="Account"
            data-testid="topnav-account-avatar"
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
            data-testid="topnav-sign-in"
            className="flex items-center justify-center min-h-touch min-w-touch rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <AccountAvatar size={28} isGuest label="Guest — sign in" />
          </button>
        )}
      </div>
    </header>
  );
}
