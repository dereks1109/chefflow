import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { BookOpen, CalendarDays, ListChecks, Info, Settings } from 'lucide-react';
import Logo from '../components/Logo';
import UsageMeter from '../components/UsageMeter';
import UpgradeButton from '../components/UpgradeButton';

const navItems = [
  { to: '/about', label: 'About', icon: Info },
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/workflows', label: 'Workflows', icon: ListChecks },
];

export default function TopNav() {
  return (
    <header
      className={[
        'hidden lg:flex',
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
        className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
      >
        <Logo variant="wordmark" className="h-7 text-slate-100 dark:text-slate-100" />
      </NavLink>

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

      <div className="ml-auto flex items-center gap-2">
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

        <UsageMeter />

        {(import.meta.env.VITE_E2E_MODE as string | undefined) !== 'true' && (
          <div className="flex items-center justify-center min-h-touch min-w-touch">
            <UserButton afterSignOutUrl="/" />
          </div>
        )}
      </div>
    </header>
  );
}
