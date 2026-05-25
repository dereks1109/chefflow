import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './ui/layout/AppLayout';
import KitchenPlaceholder from './ui/pages/KitchenPlaceholder';
import RecipesLibrary from './ui/pages/RecipesLibrary';
import RecipeEditor from './ui/pages/RecipeEditor';
import EventsLibrary from './ui/pages/EventsLibrary';
import EventView from './ui/pages/EventView';
import EventEditor from './ui/pages/EventEditor';
import NestedDndDemo from './ui/pages/NestedDndDemo';
import WorkflowsLibrary from './ui/pages/WorkflowsLibrary';
import Workflow from './ui/pages/Workflow';
import SettingsPage from './ui/pages/SettingsPage';
import AboutPage from './ui/pages/AboutPage';
import ContactPage from './ui/pages/ContactPage';
import AdminDashboard from './ui/pages/AdminDashboard';
import CommunityLibrary from './ui/pages/CommunityLibrary';
import CommunityRecipeView from './ui/pages/CommunityRecipeView';
import ChefProfile from './ui/pages/ChefProfile';
import ConsentBanner from './ui/components/ConsentBanner';
import TierSync from './ui/components/TierSync';
import AuthGateRunner from './ui/components/AuthGateRunner';
import SyncRunner from './ui/components/SyncRunner';
import ReloadOnFirstSignIn from './ui/components/ReloadOnFirstSignIn';
import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import TermsPage from './ui/pages/legal/TermsPage';
import PrivacyPage from './ui/pages/legal/PrivacyPage';
import CookiesPage from './ui/pages/legal/CookiesPage';
import DisclaimerPage from './ui/pages/legal/DisclaimerPage';
import { migrateHashToAt } from './db/migrateHashPrefix';
// Bootstrap dark mode from localStorage before first render (default: dark)
import './ui/theme/useTheme';

// Signed-in app shell. The sign-in gate at the App-root level redirects
// signed-out visitors to Clerk's hosted sign-in flow before this component
// ever renders. By the time we get here, `useUser().user.id` is guaranteed
// to be a real Clerk subject — every Dexie write gets a clean userId, the
// sync engine runs, the multi-user-shared-browser bug is fixed.
//
// SyncRunner mounts the per-user D1 sync (pull + push deltas every 30s,
// debounced on local writes). It's a noop until Clerk has loaded the user.
function PublicApp() {
  return (
    <>
      <TierSync />
      <AuthGateRunner />
      <SyncRunner />
      <ReloadOnFirstSignIn />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/recipes" replace />} />
          <Route path="/recipes" element={<RecipesLibrary />} />
          <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
          <Route path="/events" element={<EventsLibrary />} />
          <Route path="/events/:id" element={<EventView />} />
          <Route path="/events/:id/edit" element={<EventEditor />} />
          <Route path="/events/:id/cook" element={<KitchenPlaceholder />} />
          <Route path="/workflows" element={<WorkflowsLibrary />} />
          <Route path="/workflows/:eventId" element={<Workflow />} />
          <Route path="/community" element={<CommunityLibrary />} />
          <Route path="/community/:id" element={<CommunityRecipeView />} />
          <Route path="/chef/:clerkId" element={<ChefProfile />} />
          <Route path="/demo/nested-dnd" element={<NestedDndDemo />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<div className="p-6">Not found.</div>} />
        </Route>
      </Routes>
    </>
  );
}

interface AppProps {
  /** When true, Clerk gating is skipped. Set only from the E2E entry path in main.tsx. */
  e2eMode?: boolean;
}

// Ungated route tree — same routes as GatedApp but without <SignedIn>/<SignedOut>
// wrappers. Used only when e2eMode=true so Playwright tests skip auth entirely.
function UngatedApp() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/recipes" replace />} />
        <Route path="/recipes" element={<RecipesLibrary />} />
        <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
        <Route path="/events" element={<EventsLibrary />} />
        <Route path="/events/:id" element={<EventView />} />
        <Route path="/events/:id/edit" element={<EventEditor />} />
        <Route path="/events/:id/cook" element={<KitchenPlaceholder />} />
        <Route path="/workflows" element={<WorkflowsLibrary />} />
        <Route path="/workflows/:eventId" element={<Workflow />} />
        <Route path="/community" element={<CommunityLibrary />} />
        <Route path="/community/:id" element={<CommunityRecipeView />} />
        <Route path="/chef/:clerkId" element={<ChefProfile />} />
        <Route path="/demo/nested-dnd" element={<NestedDndDemo />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="*" element={<div className="p-6">Not found.</div>} />
      </Route>
    </Routes>
  );
}

export default function App({ e2eMode = false }: AppProps) {
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    // Demos are now server-provisioned (worker writes them to D1 on first
    // sign-in via SyncRunner). Local seeding is gone — anon visitors see
    // an empty library until they sign in.
    void migrateHashToAt().finally(() => setBooted(true));
  }, []);

  if (!booted) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  if (e2eMode) {
    // E2E mode: skip Clerk entirely so Playwright can exercise authenticated
    // flows without a live Clerk account or network calls to clerk.accounts.dev.
    return <UngatedApp />;
  }

  return (
    <>
      <Routes>
        {/* Public legal routes — readable signed-out, no AppLayout wrapper.
            These stay open so terms/privacy links from sign-in screens + email
            footers always resolve, regardless of session state. */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        {/* Everything else requires a Clerk session. Signed-out visitors see
            Clerk's <SignIn> centered on the page; signed-in visitors fall
            through to the public app shell. */}
        <Route
          path="*"
          element={
            <>
              <SignedIn>
                <PublicApp />
              </SignedIn>
              <SignedOut>
                <SignInGate />
              </SignedOut>
            </>
          }
        />
      </Routes>
      {/* Mounted outside auth gates so first-time signed-out visitors see it. */}
      <ConsentBanner />
    </>
  );
}

// Full-screen sign-in landing. Renders Clerk's <SignIn> component centred on a
// blank page — the chef has to authenticate before they get any app chrome.
// This is the architectural shift from "public-by-default" → "sign-in required",
// motivated by the move to per-user cloud sync (D1) and the need to fix the
// multi-user contamination bug on shared browsers.
function SignInGate() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-surface-0 p-4">
      <SignIn routing="hash" />
    </div>
  );
}
