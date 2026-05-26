import { Link, Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import TopNav from './TopNav';
import MobileTopBar from './MobileTopBar';
import UpgradeSheet from '../components/UpgradeSheet';
import { reopenConsentBanner } from '../../state/consentStore';
import { CURRENT_TOS_VERSION as CURRENT_TOS_VERSION_FOOTER } from '../../core/legal/versions';

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-surface-0">
      <TopNav />
      <MobileTopBar />

      <main
        className={[
          'flex-1',
          'pb-20 lg:pb-0',
          'print:pb-0',
          'w-full',
        ].join(' ')}
      >
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
        className="mb-14 lg:mb-0 print:!hidden border-t border-slate-200 dark:border-[rgba(255,255,255,0.06)]"
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
