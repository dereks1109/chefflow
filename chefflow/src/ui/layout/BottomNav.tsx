import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/recipes', label: 'Recipes', icon: '🍳' },
  { to: '/events', label: 'Events', icon: '📅' },
  { to: '/workflows', label: 'Workflow', icon: '🧭' },
];

export default function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-10 border-t border-slate-200 bg-white
                 dark:border-slate-800 dark:bg-kitchen-ink
                 md:static md:border-t-0 md:border-b md:flex md:gap-2 md:px-4"
    >
      <ul className="flex md:gap-2">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1 md:flex-none">
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                [
                  'touch-target px-4 py-2 flex flex-col items-center justify-center text-sm',
                  'md:flex-row md:gap-2 md:py-3',
                  isActive
                    ? 'text-accent font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100',
                ].join(' ')
              }
            >
              <span aria-hidden="true" className="text-xl md:text-base">{t.icon}</span>
              <span>{t.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
