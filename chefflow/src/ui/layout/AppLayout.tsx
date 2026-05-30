import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import SideNav from './SideNav';
import BrandLogo from '../components/BrandLogo';
import UpgradeSheet from '../components/UpgradeSheet';
import { reopenConsentBanner } from '../../state/consentStore';
import { CURRENT_TOS_VERSION as CURRENT_TOS_VERSION_FOOTER } from '../../core/legal/versions';

// T8 — three nav surfaces (TopNav / MobileTopBar / BottomNav) collapsed
// into a single SideNav. Desktop renders the sidebar as a persistent
// 240px aside; mobile renders a slim header with a hamburger button
// that opens the same SideNav inside a slide-in drawer.

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Belt-and-braces drawer close on route change. Each link inside
  // SideNav already calls onNavigate({ setDrawerOpen(false) }), but if
  // the chef navigates via the browser back button or programmatic
  // navigation (e.g. after Save), we still want the drawer closed so
  // the next page paint isn't half-occluded.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Esc closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-surface-0">
      {/* Desktop: persistent left sidebar. */}
      <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen print:!hidden">
        <SideNav />
      </aside>

      {/* Mobile: drawer + backdrop. Stays mounted so the slide
          animation runs both ways; pointer-events disabled when closed
          so it doesn't block the page underneath. */}
      <div
        className={[
          'lg:hidden fixed inset-0 z-40 print:!hidden',
          drawerOpen ? '' : 'pointer-events-none',
        ].join(' ')}
        aria-hidden={!drawerOpen}
      >
        <div
          data-testid="sidenav-backdrop"
          onClick={() => setDrawerOpen(false)}
          className={[
            'absolute inset-0 bg-black/50 transition-opacity duration-200',
            drawerOpen ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
        <aside
          className={[
            'absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl',
            'transform transition-transform duration-200',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <SideNav onNavigate={() => setDrawerOpen(false)} />
        </aside>
      </div>

      {/* Right column (main content + mobile header + footer). */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile-only slim header with hamburger trigger. */}
        <header
          className={[
            'lg:hidden sticky top-0 z-30 print:!hidden',
            'h-14 w-full flex items-center gap-2 px-4',
            'bg-white/90 dark:bg-surface-0/90 backdrop-blur-md',
            'border-b border-slate-200 dark:border-[rgba(255,255,255,0.06)]',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            aria-controls="sidenav-drawer"
            data-testid="mobile-menu-toggle"
            className="min-h-touch min-w-touch flex items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {drawerOpen
              ? <X size={22} aria-hidden="true" />
              : <Menu size={22} aria-hidden="true" />}
          </button>
          <Link
            to="/recipes"
            aria-label="ChefFlow home"
            className="flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md px-1 py-1 hover:text-accent"
          >
            <BrandLogo showText textClassName="text-sm font-semibold" />
          </Link>
        </header>

        <main className="flex-1 w-full print:pb-0">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 print:p-0">
            <Outlet />
          </div>
        </main>

        {/* Print-only legal footer. Hidden on screen; rendered at the end of
            the printed output so a chef who prints a recipe / prep sheet
            to PDF (or paper for the prep board) still carries the
            chef-declared / supplier-labels reminder with them. */}
        <div
          aria-hidden="true"
          data-testid="print-only-disclaimer"
          className="hidden print:!block print:!text-center print:!text-[10px] print:!text-slate-700 print:!py-1 print:!border-t print:!border-slate-300 print:!mt-4"
        >
          Allergens are chef-declared. Verify against supplier labels. — ChefFlow ({CURRENT_TOS_VERSION_FOOTER})
        </div>

        <footer
          className="print:!hidden border-t border-slate-200 dark:border-[rgba(255,255,255,0.06)]"
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
      </div>

      <UpgradeSheet />
    </div>
  );
}
