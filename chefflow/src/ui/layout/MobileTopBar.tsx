import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { Command } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import Logo from '../components/Logo';

interface MobileTopBarProps {
  onOpenPalette: () => void;
}

export default function MobileTopBar({ onOpenPalette }: MobileTopBarProps) {
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
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open command palette"
          className={[
            'flex items-center justify-center',
            'min-h-touch min-w-touch rounded-lg',
            'text-slate-500 hover:text-slate-900',
            'dark:text-slate-400 dark:hover:text-slate-100',
            'hover:bg-slate-100 dark:hover:bg-surface-3',
            'transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          <Command size={20} aria-hidden="true" />
        </button>

        <ThemeToggle />

        {/* UserButton requires ClerkProvider — omit in E2E mode where Clerk is bypassed */}
        {(import.meta.env.VITE_E2E_MODE as string | undefined) !== 'true' && (
          <div className="flex items-center justify-center min-h-touch min-w-touch">
            <UserButton afterSignOutUrl="/" />
          </div>
        )}
      </div>
    </header>
  );
}
