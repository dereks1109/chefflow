import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import TopNav from './TopNav';
import MobileTopBar from './MobileTopBar';
import CommandPalette from '../components/CommandPalette';
import { reopenConsentBanner } from '../../state/consentStore';

export default function AppLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Global Cmd-K / Ctrl-K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-surface-0">
      {/* Desktop top nav — hidden on mobile */}
      <TopNav onOpenPalette={openPalette} />

      {/* Mobile top bar — hidden on desktop */}
      <MobileTopBar onOpenPalette={openPalette} />

      {/* Main content area */}
      <main
        className={[
          'flex-1',
          // Breathing room above bottom nav on mobile; no extra padding needed on desktop
          'pb-20 lg:pb-0',
          // Constrain width on large screens
          'w-full',
        ].join(' ')}
      >
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>

      {/* Discreet legal footer — desktop only (mobile is covered by BottomNav) */}
      <footer
        className="hidden lg:block border-t border-slate-200 dark:border-[rgba(255,255,255,0.06)]"
        aria-label="Legal"
      >
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
          <Link to="/terms" className="hover:text-accent">Terms</Link>
          <Link to="/privacy" className="hover:text-accent">Privacy</Link>
          <Link to="/cookies" className="hover:text-accent">Cookies</Link>
          <Link to="/disclaimer" className="hover:text-accent">Disclaimer</Link>
          <button
            type="button"
            onClick={reopenConsentBanner}
            className="hover:text-accent"
          >
            Cookie preferences
          </button>
        </div>
      </footer>

      {/* Mobile bottom nav — hidden on desktop */}
      <BottomNav />

      {/* Command palette — mounted once at layout level */}
      <CommandPalette isOpen={paletteOpen} onClose={closePalette} />
    </div>
  );
}
