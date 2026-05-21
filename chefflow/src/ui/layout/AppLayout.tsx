import { Link, Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import TopNav from './TopNav';
import MobileTopBar from './MobileTopBar';
import UpgradeSheet from '../components/UpgradeSheet';
import { reopenConsentBanner } from '../../state/consentStore';

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-surface-0">
      <TopNav />
      <MobileTopBar />

      <main
        className={[
          'flex-1',
          'pb-20',
          'w-full',
        ].join(' ')}
      >
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>

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

      <BottomNav />

      <UpgradeSheet />
    </div>
  );
}
