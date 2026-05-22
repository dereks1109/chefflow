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
import AdminDashboard from './ui/pages/AdminDashboard';
import CommunityLibrary from './ui/pages/CommunityLibrary';
import CommunityRecipeView from './ui/pages/CommunityRecipeView';
import ConsentBanner from './ui/components/ConsentBanner';
import TierSync from './ui/components/TierSync';
import AuthGateRunner from './ui/components/AuthGateRunner';
import TermsPage from './ui/pages/legal/TermsPage';
import PrivacyPage from './ui/pages/legal/PrivacyPage';
import CookiesPage from './ui/pages/legal/CookiesPage';
import DisclaimerPage from './ui/pages/legal/DisclaimerPage';
import { seedDemoRecipes, seedDemoEvents } from './db/seed';
// Bootstrap dark mode from localStorage before first render (default: dark)
import './ui/theme/useTheme';

// Public-by-default app shell. Anonymous users browse all pages (recipes,
// events, workflows, community, etc.); write actions are gated via the
// useAuthGate hook (see src/state/useAuthGate.ts) which pops Clerk's
// sign-in modal and re-fires the queued action once Clerk reports the
// user is signed in (AuthGateRunner watches).
//
// TierSync + AuthGateRunner mount unconditionally — both noop for anon
// users so they're safe to render at all times.
function PublicApp() {
  return (
    <>
      <TierSync />
      <AuthGateRunner />
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
          <Route path="/demo/nested-dnd" element={<NestedDndDemo />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
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
        <Route path="/demo/nested-dnd" element={<NestedDndDemo />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<div className="p-6">Not found.</div>} />
      </Route>
    </Routes>
  );
}

export default function App({ e2eMode = false }: AppProps) {
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    Promise.all([seedDemoRecipes(), seedDemoEvents()]).finally(() => setBooted(true));
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
        {/* Public legal routes — readable signed-out, no AppLayout wrapper. */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        {/* Everything else renders publicly; write actions gate via the
            useAuthGate hook from inside individual components. */}
        <Route path="*" element={<PublicApp />} />
      </Routes>
      {/* Mounted outside auth gates so first-time signed-out visitors see it. */}
      <ConsentBanner />
    </>
  );
}
