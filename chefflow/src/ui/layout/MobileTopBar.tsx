import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { Settings } from 'lucide-react';
import Logo from '../components/Logo';
import UsageMeter from '../components/UsageMeter';
import UpgradeButton from '../components/UpgradeButton';

export default function MobileTopBar() {
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
        className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
      >
        <Logo variant="mark" className="h-6 text-slate-900 dark:text-slate-100" />
      </NavLink>

      <div className="ml-auto flex items-center gap-1">
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

        {(import.meta.env.VITE_E2E_MODE as string | undefined) !== 'true' && (
          <div className="flex items-center justify-center min-h-touch min-w-touch">
            <UserButton afterSignOutUrl="/" />
          </div>
        )}
      </div>
    </header>
  );
}
