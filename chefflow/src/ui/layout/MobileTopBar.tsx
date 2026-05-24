import { NavLink } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { Command, UserCog, Database, LifeBuoy } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { useAccountSetupStore } from '../../state/accountSetupStore';
import { useAccountDataStore } from '../../state/accountDataStore';
import { useHelpStore } from '../../state/helpStore';

interface MobileTopBarProps {
  onOpenPalette: () => void;
}

export default function MobileTopBar({ onOpenPalette }: MobileTopBarProps) {
  const openSetup = useAccountSetupStore((s) => s.setOpen);
  const openData = useAccountDataStore((s) => s.setOpen);
  const openHelp = useHelpStore((s) => s.setOpen);
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
        className="flex items-center gap-1.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
      >
        <span className="font-display font-bold text-lg tracking-tight text-slate-900 dark:text-slate-100">
          Chef
        </span>
        <span className="font-display font-bold text-lg tracking-tight text-accent">
          Flow
        </span>
        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
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
              <UserButton.Action
                label="Help & feedback"
                labelIcon={<LifeBuoy size={14} aria-hidden="true" />}
                onClick={() => openHelp(true)}
              />
            </UserButton.MenuItems>
          </UserButton>
        </div>
      </div>
    </header>
  );
}
