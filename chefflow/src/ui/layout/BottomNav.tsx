import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, CalendarDays, Globe2, ListChecks } from 'lucide-react';

const tabs = [
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/workflows', label: 'Workflows', icon: ListChecks },
  { to: '/community', label: 'Community', icon: Globe2 },
];

export default function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Primary"
      className={[
        'lg:hidden',
        'print:!hidden',
        'fixed bottom-0 inset-x-0 z-30',
        'border-t border-[rgba(255,255,255,0.06)]',
        'bg-surface-0/90 backdrop-blur-md',
        'dark:bg-surface-0/90',
        'safe-area-pb',
      ].join(' ')}
    >
      <ul
        className="flex items-stretch max-w-screen-2xl mx-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {tabs.map(({ to, label, icon: Icon }) => {
          const isActive = pathname === to || pathname.startsWith(to + '/');

          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                data-testid={`nav-${to.slice(1)}`}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'relative flex flex-col items-center justify-center gap-1',
                  'min-h-[56px] w-full px-2 py-2',
                  'text-xs font-medium',
                  'transition-colors duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
                  isActive
                    ? 'text-accent'
                    : 'text-slate-500 hover:text-slate-300',
                ].join(' ')}
              >
                {/* Active indicator pill behind icon */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className={[
                      'absolute top-2 left-1/2 -translate-x-1/2',
                      'h-8 w-12 rounded-full',
                      'bg-accent/15',
                      'transition-all duration-200',
                    ].join(' ')}
                  />
                )}

                <span className="relative flex items-center justify-center h-6 w-6">
                  <Icon
                    size={22}
                    aria-hidden="true"
                    strokeWidth={isActive ? 2.5 : 1.75}
                  />
                </span>
                <span className="relative leading-none">{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
