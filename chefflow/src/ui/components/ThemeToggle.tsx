import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../theme/useTheme';

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      onClick={toggleTheme}
      className={[
        'flex items-center justify-center',
        'min-h-touch min-w-touch rounded-lg',
        'text-slate-400 hover:text-slate-100',
        'transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'dark:hover:bg-surface-3',
        'hover:bg-slate-100 dark:hover:bg-surface-3',
        className,
      ].join(' ')}
    >
      {isDark ? (
        <Sun size={20} aria-hidden="true" />
      ) : (
        <Moon size={20} aria-hidden="true" />
      )}
    </button>
  );
}
