import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './ui/layout/AppLayout';
import KitchenPlaceholder from './ui/pages/KitchenPlaceholder';
import RecipesLibrary from './ui/pages/RecipesLibrary';
import RecipeEditor from './ui/pages/RecipeEditor';
import RecipeView from './ui/pages/RecipeView';
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
import OnboardingGate from './ui/components/OnboardingGate';
import TosReacceptanceGate from './ui/components/TosReacceptanceGate';
import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import TermsPage from './ui/pages/legal/TermsPage';
import PrivacyPage from './ui/pages/legal/PrivacyPage';
import CookiesPage from './ui/pages/legal/CookiesPage';
import DisclaimerPage from './ui/pages/legal/DisclaimerPage';
import { migrateHashToAt } from './db/migrateHashPrefix';
// Bootstrap dark mode from localStorage before first render (default: dark)
import './ui/theme/useTheme';

// Guest-browseable app shell. The chef wanted the site to be visible
// signed-out so unfamiliar visitors can preview the demos, the
// community library, the marketing pages, and the legal text without
// hitting a sign-in wall. Write actions (edit / delete / publish /
// upgrade) still require a Clerk session via the auth-gated routes
// below.
//
// The shared-browser data-contamination bug that originally motivated
// the always-sign-in posture is structural-not-gating: every Dexie
// read/write filters by `getCurrentUserId()`, which returns an
// `anon:*` id pre-Clerk. `migrateAnonRowsForUser()` runs on first
// sign-in to move any anon rows into the real user scope. So a guest
// browse of /recipes shows demos read-only from the worker, and no
// guest-mode Dexie writes ever happen (the libraries detect
// useIsGuest and short-circuit the local repo).
//
// SyncRunner / TierSync / AuthGateRunner / ReloadOnFirstSignIn all
// self-noop when there is no signed-in user, so it's safe to mount
// them outside the auth gate.
function PublicApp() {
  return (
    <>
      <TierSync />
      <AuthGateRunner />
      <SyncRunner />
      <ReloadOnFirstSignIn />
      <Routes>
        <Route element={<AppLayout />}>
          {/* Always-public routes — guest-browseable */}
          <Route path="/" element={<Navigate to="/recipes" replace />} />
          <Route path="/recipes" element={<RecipesLibrary />} />
          <Route path="/recipes/:id" element={<RecipeView />} />
          <Route path="/events" element={<EventsLibrary />} />
          <Route path="/events/:id" element={<EventView />} />
          <Route path="/community" element={<CommunityLibrary />} />
          <Route path="/community/:id" element={<CommunityRecipeView />} />
          <Route path="/chef/:clerkId" element={<ChefProfile />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/demo/nested-dnd" element={<NestedDndDemo />} />

          {/* Auth-required routes — guest hits Clerk sign-in.
              OnboardingGate + TosReacceptanceGate run inside the
              SignedIn branch so first-time / version-bumped chefs
              get the modals before they reach the page body. */}
          <Route path="/recipes/:id/edit" element={<RequireAuth><RecipeEditor /></RequireAuth>} />
          <Route path="/events/:id/edit" element={<RequireAuth><EventEditor /></RequireAuth>} />
          <Route path="/events/:id/cook" element={<RequireAuth><KitchenPlaceholder /></RequireAuth>} />
          <Route path="/workflows" element={<RequireAuth><WorkflowsLibrary /></RequireAuth>} />
          <Route path="/workflows/:eventId" element={<RequireAuth><Workflow /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />

          <Route path="*" element={<div className="p-6">Not found.</div>} />
        </Route>
      </Routes>
    </>
  );
}

// Auth-gated wrapper. Signed-in users pass through (with the standard
// onboarding + ToS-reacceptance modal gates layered in); signed-out
// users see the Clerk sign-in form full-screen.
function RequireAuth({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>
        <OnboardingGate>
          <TosReacceptanceGate>{children}</TosReacceptanceGate>
        </OnboardingGate>
      </SignedIn>
      <SignedOut>
        <SignInGate />
      </SignedOut>
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
        {/* Legal pages — readable signed-out, no AppLayout wrapper.
            These stay separate so terms/privacy links from sign-in
            screens + email footers always resolve cleanly without the
            in-app navigation chrome. */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        {/* Everything else routes through the guest-browseable app
            shell. Per-route <RequireAuth> wrappers gate the routes
            that need a signed-in user (editors, settings, admin,
            workflows). */}
        <Route path="*" element={<PublicApp />} />
      </Routes>
      {/* Mounted outside auth gates so signed-out visitors see it on
          their first visit (PECR consent must precede any non-essential
          storage). */}
      <ConsentBanner />
    </>
  );
}

// Full-screen sign-in landing — shown by RequireAuth when the chef
// hits a write-only route (editor, settings, admin, workflows) while
// signed out. Renders Clerk's <SignIn> component centred on a blank
// page; signing in re-mounts the requested route under the
// SignedIn branch.
function SignInGate() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-surface-0 p-4">
      <SignIn routing="hash" />
    </div>
  );
}
