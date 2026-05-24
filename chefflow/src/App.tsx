import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, useUser } from '@clerk/clerk-react';
import AppLayout from './ui/layout/AppLayout';
import KitchenPlaceholder from './ui/pages/KitchenPlaceholder';
import RecipesLibrary from './ui/pages/RecipesLibrary';
import RecipeEditor from './ui/pages/RecipeEditor';
import EventsLibrary from './ui/pages/EventsLibrary';
import EventView from './ui/pages/EventView';
import EventEditor from './ui/pages/EventEditor';
import RecipeView from './ui/pages/RecipeView';
import NestedDndDemo from './ui/pages/NestedDndDemo';
import WorkflowsLibrary from './ui/pages/WorkflowsLibrary';
import Workflow from './ui/pages/Workflow';
import SignInScreen from './ui/components/SignInScreen';
import AccountSetupSheet from './ui/components/AccountSetupSheet';
import AccountDataSheet from './ui/components/AccountDataSheet';
import { seedDemoRecipes, seedDemoEvents } from './db/seed';
import { claimLegacyRows } from './db/dexie';
import { setCurrentUserId } from './state/currentUser';
import { startPrefsSync } from './state/userPrefsSync';
import { useAccountSetupStore } from './state/accountSetupStore';
import { useAccountDataStore } from './state/accountDataStore';
import { getPrefs } from './db/prefsRepo';
import type { UserPrefs } from './core/types';
import { syncNow, refreshPendingCount } from './db/syncClient';
// Bootstrap dark mode from localStorage before first render (default: dark)
import './ui/theme/useTheme';

const SYNC_INTERVAL_MS = 60_000;

export default function App() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [booted, setBooted] = useState(false);
  const [prefs, setPrefs] = useState<UserPrefs | undefined>(undefined);
  const setupOpen = useAccountSetupStore((s) => s.open);
  const setSetupOpen = useAccountSetupStore((s) => s.setOpen);
  const dataOpen = useAccountDataStore((s) => s.open);
  const setDataOpen = useAccountDataStore((s) => s.setOpen);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      setCurrentUserId(null);
      // Async to keep setState out of the effect's synchronous body.
      Promise.resolve().then(() => {
        setPrefs(undefined);
        setSetupOpen(false);
        setBooted(true);
      });
      return;
    }

    let cancelled = false;
    const userId = user.id;
    setCurrentUserId(userId);
    let stopPrefsSync: (() => void) | null = null;

    (async () => {
      try {
        await claimLegacyRows(userId);
        await Promise.all([seedDemoRecipes(userId), seedDemoEvents(userId)]);
        stopPrefsSync = await startPrefsSync();
        await refreshPendingCount(userId);
        const loaded = await getPrefs();
        if (!cancelled) {
          setPrefs(loaded);
          // Auto-open the setup wizard for first-time users (no completion
          // and no skip on the record).
          if (!loaded?.onboardedAt && !loaded?.onboardSkippedAt) {
            setSetupOpen(true);
          }
        }
      } finally {
        if (!cancelled) setBooted(true);
      }
      // Fire-and-forget initial sync — never blocks the UI from rendering.
      void syncNow();
    })();

    // Background sync: trigger on reconnect and every minute. Same `syncNow`
    // call sites, so the in-flight lock handles overlap.
    const onOnline = () => { void syncNow(); };
    window.addEventListener('online', onOnline);
    const intervalId = window.setInterval(() => { void syncNow(); }, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.clearInterval(intervalId);
      stopPrefsSync?.();
    };
  }, [isLoaded, isSignedIn, user, setSetupOpen]);

  if (!isLoaded || !booted) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  return (
    <>
      <SignedOut>
        <SignInScreen />
      </SignedOut>
      <SignedIn>
        <AccountSetupSheet
          open={setupOpen}
          onClose={async () => {
            setSetupOpen(false);
            // Refresh local prefs cache so a subsequent re-open prefills with
            // the freshly-saved values.
            try {
              setPrefs(await getPrefs());
            } catch {
              /* ignore — non-fatal */
            }
          }}
          initialPrefs={prefs}
        />
        <AccountDataSheet open={dataOpen} onClose={() => setDataOpen(false)} />
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/recipes" replace />} />
            <Route path="/recipes" element={<RecipesLibrary />} />
            <Route path="/recipes/:id" element={<RecipeView />} />
            <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
            <Route path="/events" element={<EventsLibrary />} />
            <Route path="/events/:id" element={<EventView />} />
            <Route path="/events/:id/edit" element={<EventEditor />} />
            <Route path="/events/:id/cook" element={<KitchenPlaceholder />} />
            <Route path="/workflows" element={<WorkflowsLibrary />} />
            <Route path="/workflows/:eventId" element={<Workflow />} />
            <Route path="/demo/nested-dnd" element={<NestedDndDemo />} />
            <Route path="*" element={<div className="p-6">Not found.</div>} />
          </Route>
        </Routes>
      </SignedIn>
    </>
  );
}
