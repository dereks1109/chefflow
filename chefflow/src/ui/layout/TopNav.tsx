import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { BookOpen, CalendarDays, ListChecks, Command, UserCog, Database } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import SyncStatusChip from '../components/SyncStatusChip';
import { useAccountSetupStore } from '../../state/accountSetupStore';
import { useAccountDataStore } from '../../state/accountDataStore';

const navItems = [
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/workflows', label: 'Workflows', icon: ListChecks },
];

interface TopNavProps {
  onOpenPalette: () => void;
}

export default function TopNav({ onOpenPalette }: TopNavProps) {
  const openSetup = useAccountSetupStore((s) => s.setOpen);
  const openData = useAccountDataStore((s) => s.setOpen);
  return (
    <header
      className={[
        'hidden lg:flex',
        'sticky top-0 z-30',
        'h-14 w-full',
        'items-center gap-4 px-6',
        // Glass morphism over True Black
        'bg-surface-0/80 backdrop-blur-md',
        'border-b border-[rgba(255,255,255,0.06)]',
        'dark:bg-surface-0/80',
        // Light mode fallback
        'light:bg-white/90 light:border-slate-200',
      ].join(' ')}
    >
      {/* Logo */}
      <NavLink
        to="/recipes"
        aria-label="ChefFlow home"
        className="flex items-center gap-1.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
      >
        <span className="font-display font-bold text-xl tracking-tight text-slate-100 dark:text-slate-100">
          Chef
        </span>
        {/* Teal accent dot acting as the "F" emphasis */}
        <span className="font-display font-bold text-xl tracking-tight text-accent">
          Flow
        </span>
        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
      </NavLink>

      {/* Primary nav links */}
      <nav aria-label="Primary" className="flex items-center gap-1 ml-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
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

      {/* Right side actions */}
      <div className="ml-auto flex items-center gap-2">
        {/* Cmd-K hint button */}
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open command palette"
          className={[
            'hidden xl:flex items-center gap-2 px-3 h-9 rounded-md',
            'text-sm text-slate-500 hover:text-slate-300',
            'border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.14)]',
            'bg-surface-2 hover:bg-surface-3',
            'transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          <Command size={14} aria-hidden="true" />
          <span>Search</span>
          <kbd className="ml-1 rounded bg-surface-3 px-1.5 py-0.5 text-xs font-mono text-slate-500">
            ⌘K
          </kbd>
        </button>

        {/* Icon-only Cmd-K for xl- screens */}
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open command palette"
          className={[
            'xl:hidden flex items-center justify-center',
            'min-h-touch min-w-touch rounded-lg',
            'text-slate-400 hover:text-slate-100 hover:bg-surface-3',
            'transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          <Command size={20} aria-hidden="true" />
        </button>

        <SyncStatusChip />

        <ThemeToggle />

        <div className="flex items-center justify-center min-h-touch min-w-touch">
          <UserButton afterSignOutUrl="/">
            <UserButton.MenuItems>
              <UserButton.Action
                label="Account setup"
                labelIcon={<UserCog size={14} aria-hidden="true" />}
                onClick={() => openSetup(true)}
              />
              <UserButton.Action
                label="Account data"
                labelIcon={<Database size={14} aria-hidden="true" />}
                onClick={() => openData(true)}
              />
            </UserButton.MenuItems>
          </UserButton>
        </div>
      </div>
    </header>
  );
}
