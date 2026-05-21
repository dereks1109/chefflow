import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { BookOpen, CalendarDays, Globe2, ListChecks, Info, Settings, Shield } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import UsageMeter from '../components/UsageMeter';
import UpgradeButton from '../components/UpgradeButton';
import { useAdminStore } from '../../state/useAdminStore';

const navItems = [
  { to: '/about', label: 'About', icon: Info },
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/workflows', label: 'Workflows', icon: ListChecks },
  { to: '/community', label: 'Community', icon: Globe2 },
];

export default function TopNav() {
  const isAdmin = useAdminStore((s) => s.isAdmin);
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
