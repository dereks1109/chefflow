import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
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
import SignInScreen from './ui/components/SignInScreen';
import ConsentBanner from './ui/components/ConsentBanner';
import TermsPage from './ui/pages/legal/TermsPage';
import PrivacyPage from './ui/pages/legal/PrivacyPage';
import CookiesPage from './ui/pages/legal/CookiesPage';
import DisclaimerPage from './ui/pages/legal/DisclaimerPage';
import { seedDemoRecipes, seedDemoEvents } from './db/seed';
// Bootstrap dark mode from localStorage before first render (default: dark)
import './ui/theme/useTheme';

// Renders inside <Routes>; chooses between SignInScreen (signed-out) and the
// authenticated app shell. Kept as a separate element so we can sit it
// alongside the public legal routes in the top-level <Routes>.
function GatedApp() {
  return (
    <>
      <SignedOut>
        <SignInScreen />
      </SignedOut>
      <SignedIn>
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
            <Route path="/demo/nested-dnd" element={<NestedDndDemo />} />
            <Route path="*" element={<div className="p-6">Not found.</div>} />
          </Route>
        </Routes>
      </SignedIn>
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
        <Route path="/demo/nested-dnd" element={<NestedDndDemo />} />
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
        {/* Everything else falls through the Clerk auth gate. */}
        <Route path="*" element={<GatedApp />} />
      </Routes>
      {/* Mounted outside auth gates so first-time signed-out visitors see it. */}
      <ConsentBanner />
    </>
  );
}
