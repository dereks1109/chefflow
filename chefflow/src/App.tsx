import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './ui/layout/AppLayout';
import KitchenPlaceholder from './ui/pages/KitchenPlaceholder';
import RecipesLibrary from './ui/pages/RecipesLibrary';
import RecipeEditor from './ui/pages/RecipeEditor';
import EventsLibrary from './ui/pages/EventsLibrary';
import EventView from './ui/pages/EventView';
import EventEditor from './ui/pages/EventEditor';
import { seedDemoRecipes } from './db/seed';

export default function App() {
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    seedDemoRecipes().finally(() => setBooted(true));
  }, []);

  if (!booted) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

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
        <Route path="*" element={<div className="p-6">Not found.</div>} />
      </Route>
    </Routes>
  );
}
