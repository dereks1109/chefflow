import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './ui/layout/AppLayout';
import KitchenPlaceholder from './ui/pages/KitchenPlaceholder';
import RecipesLibrary from './ui/pages/RecipesLibrary';
import RecipeEditor from './ui/pages/RecipeEditor';
import RecipeView from './ui/pages/RecipeView';
import EventsLibrary from './ui/pages/EventsLibrary';
import EventView from './ui/pages/EventView';
import WorkflowsLibrary from './ui/pages/WorkflowsLibrary';
import TeamAccept from './ui/pages/TeamAccept';
import AboutPage from './ui/pages/AboutPage';
import ConsentBanner from './ui/components/ConsentBanner';
import TierSync from './ui/components/TierSync';
import AuthGateRunner from './ui/components/AuthGateRunner';
import SyncRunner from './ui/components/SyncRunner';
import ReloadOnFirstSignIn from './ui/components/ReloadOnFirstSignIn';
import OnboardingGate from './ui/components/OnboardingGate';
import TosReacceptanceGate from './ui/components/TosReacceptanceGate';
import ProductTour from './ui/components/ProductTour';
import { SignedIn, SignedOut, SignIn, useUser } from '@clerk/clerk-react';
import { migrateHashToAt } from './db/migrateHashPrefix';

// T7 Phase C — code-splitting. These pages either pull in heavy
// transitive deps (decimal.js, @hello-pangea/dnd, gray-matter, the
// 1.7k-LoC Settings tabs, the workflow scheduler) or sit off the
// guest-browse landing path. Lazy-loading them keeps the first-paint
// chunk small. Eager imports above are the library + landing surfaces
// that every signed-in chef hits within their first second.
const SettingsPage = lazy(() => import('./ui/pages/SettingsPage'));
const Workflow = lazy(() => import('./ui/pages/Workflow'));
const AdminDashboard = lazy(() => import('./ui/pages/AdminDashboard'));
const EventEditor = lazy(() => import('./ui/pages/EventEditor'));
const NestedDndDemo = lazy(() => import('./ui/pages/NestedDndDemo'));
const TeamsList = lazy(() => import('./ui/pages/TeamsList'));
const TeamDetail = lazy(() => import('./ui/pages/TeamDetail'));
const CommunityLibrary = lazy(() => import('./ui/pages/CommunityLibrary'));
const CommunityRecipeView = lazy(() => import('./ui/pages/CommunityRecipeView'));
const ChefProfile = lazy(() => import('./ui/pages/ChefProfile'));
const ContactPage = lazy(() => import('./ui/pages/ContactPage'));
const TermsPage = lazy(() => import('./ui/pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./ui/pages/legal/PrivacyPage'));
const CookiesPage = lazy(() => import('./ui/pages/legal/CookiesPage'));
const DisclaimerPage = lazy(() => import('./ui/pages/legal/DisclaimerPage'));

function LazyFallback() {
  return <div className="p-6 text-slate-500">Loading…</div>;
}
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
      {/* Mounted at root so the spotlight overlay can land on any
          page the chef navigates to after first-time OnboardingSheet
          completion. Self-renders nothing when the tour isn't active. */}
      <ProductTour />
      <Suspense fallback={<LazyFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
          {/* Always-public routes — guest-browseable.
              `/` is the marketing landing (AboutPage content) for
              signed-out visitors; signed-in chefs hit `/recipes`. The
              `/about` route stays as a permanent redirect to `/` for
              backward compat with bookmarks/external links. */}
          <Route path="/" element={<LandingOrRedirect />} />
          <Route path="/about" element={<Navigate to="/" replace />} />
          <Route path="/recipes" element={<RecipesLibrary />} />
          <Route path="/recipes/:id" element={<RecipeView />} />
          <Route path="/events" element={<EventsLibrary />} />
          <Route path="/events/:id" element={<EventView />} />
          <Route path="/community" element={<CommunityLibrary />} />
          <Route path="/community/:id" element={<CommunityRecipeView />} />
          <Route path="/chef/:clerkId" element={<ChefProfile />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/demo/nested-dnd" element={<NestedDndDemo />} />
          {/* T3c Phase 5 — invite accept landing. Public so the link from
              the invite email opens without an upstream auth wall; the
              page renders a "Sign in to accept" prompt if the chef isn't
              signed in yet, then auto-POSTs the token to the worker. */}
          <Route path="/teams/accept" element={<TeamAccept />} />

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
          {/* T5: Teams as a top-nav surface for Enterprise owners. */}
          <Route path="/teams" element={<RequireAuth><TeamsList /></RequireAuth>} />
          <Route path="/teams/:id" element={<RequireAuth><TeamDetail /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />

            <Route path="*" element={<div className="p-6">Not found.</div>} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

// `/` decides between marketing landing (signed-out) and the app
// (signed-in). Avoids two near-identical pages — AboutPage is the
// landing content; signed-in chefs skip it and land on /recipes.
// E2E mode short-circuits to signed-in so Playwright doesn't see the
// landing during route smoke tests.
function LandingOrRedirect() {
  const { isSignedIn, isLoaded } = useUser();
  const isE2E = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
  // Wait for Clerk to load so signed-in chefs don't see a flash of
  // the marketing page before the redirect kicks in.
  if (!isE2E && !isLoaded) return null;
  if (isSignedIn || isE2E) return <Navigate to="/recipes" replace />;
  return <AboutPage />;
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
    <Suspense fallback={<LazyFallback />}>
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
    </Suspense>
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
      <Suspense fallback={<LazyFallback />}>
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
      </Suspense>
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
