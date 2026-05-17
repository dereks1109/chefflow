import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import TopNav from './TopNav';
import MobileTopBar from './MobileTopBar';
import CommandPalette from '../components/CommandPalette';

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

      {/* Mobile bottom nav — hidden on desktop */}
      <BottomNav />

      {/* Command palette — mounted once at layout level */}
      <CommandPalette isOpen={paletteOpen} onClose={closePalette} />
    </div>
  );
}
