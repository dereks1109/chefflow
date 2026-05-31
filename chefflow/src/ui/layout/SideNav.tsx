import { NavLink } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import {
  BookOpen,
  CalendarDays,
  Globe2,
  ListChecks,
  Mail,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import UpgradeButton from '../components/UpgradeButton';
import AccountAvatar from '../components/AccountAvatar';
import { useAdminStore } from '../../state/useAdminStore';

// T8 — single source of truth for the chef's nav. Replaces the three
// pre-T8 surfaces (TopNav lg-only, MobileTopBar lg:hidden, BottomNav
// lg:hidden) so feature discoverability is identical on desktop and
// mobile. AppLayout renders this twice: once inside a persistent
// desktop aside, once inside a slide-in drawer for mobile. `onNavigate`
// fires on every link click so the drawer can close itself.
//
// T11 — Teams is now visible to ALL signed-in chefs, not just
// Enterprise. Non-Enterprise users can be MEMBERS of an Enterprise
// owner's team via the invite flow and need /teams access to see what's
// shared with them. The /teams page itself handles the role-based view
// (member-only chefs see read-only "View" cards; only Enterprise sees
// "+ New team"). Admin stays gated to isAdmin.

interface Props {
  /** Called whenever a primary or footer nav link is clicked. Drawer
   *  callers pass `setOpen(false)` so tapping a link in the drawer
   *  navigates AND collapses the drawer in one gesture. Desktop callers
   *  can pass a no-op. */
  onNavigate?: () => void;
}

const BASE_NAV_ITEMS = [
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/workflows', label: 'Workflows', icon: ListChecks },
  { to: '/community', label: 'Community', icon: Globe2 },
  { to: '/contact', label: 'Contact', icon: Mail },
] as const;

export default function SideNav({ onNavigate }: Props) {
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const { isSignedIn } = useUser();
  const clerk = useClerk();
  const isE2E = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
  const showSignedInChrome = isE2E || isSignedIn;

  // T11 — Teams is visible to everyone; the /teams page itself decides
  // whether to render owner-only chrome (create team / rename / invite)
  // based on the per-group `role` returned from the worker.
  const navItems = [
    ...BASE_NAV_ITEMS.slice(0, 3),
    { to: '/teams', label: 'Teams', icon: Users } as const,
    ...BASE_NAV_ITEMS.slice(3),
  ];

  function handleNavigate() {
    onNavigate?.();
  }

  return (
    <div
      data-testid="sidenav"
      className="flex h-full w-full flex-col bg-surface-0 dark:bg-surface-0 border-r border-slate-200 dark:border-[rgba(255,255,255,0.06)]"
    >
      {/* Brand anchor (also the home link). */}
      <NavLink
        to="/recipes"
        onClick={handleNavigate}
        aria-label="ChefFlow home"
        className="flex items-center px-4 h-14 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <BrandLogo showText textClassName="text-sm font-semibold" />
      </NavLink>

      <nav aria-label="Primary" className="flex flex-col gap-1 px-3 py-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={handleNavigate}
            data-testid={`nav-${to.slice(1)}`}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-surface-3',
              ].join(' ')
            }
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Spacer — pushes the footer chrome to the bottom of the
          sidebar / drawer. */}
      <div className="flex-1" />

      <div className="flex flex-col gap-1 px-3 py-3 border-t border-slate-200 dark:border-[rgba(255,255,255,0.06)]">
        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={handleNavigate}
            aria-label="Admin dashboard"
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-surface-3',
              ].join(' ')
            }
          >
            <Shield size={18} aria-hidden="true" />
            Admin
          </NavLink>
        )}

        <UpgradeButton />

        <NavLink
          to="/settings"
          onClick={handleNavigate}
          aria-label="Settings"
          className={({ isActive }) =>
            [
              'flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium',
              'transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              isActive
                ? 'bg-accent/10 text-accent'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-surface-3',
            ].join(' ')
          }
        >
          <Settings size={18} aria-hidden="true" />
          Settings
        </NavLink>

        {showSignedInChrome ? (
          <NavLink
            to="/settings"
            onClick={handleNavigate}
            aria-label="Account"
            title="Account"
            data-testid="sidenav-account-avatar"
            className="flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <AccountAvatar size={22} label="Account" />
            Account
          </NavLink>
        ) : (
          <button
            type="button"
            onClick={() => { handleNavigate(); clerk.openSignIn?.(); }}
            aria-label="Sign in"
            title="Sign in"
            data-testid="sidenav-sign-in"
            className="flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <AccountAvatar size={22} isGuest label="Guest — sign in" />
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}
