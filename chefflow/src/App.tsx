import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './ui/layout/AppLayout';
import EventsPlaceholder from './ui/pages/EventsPlaceholder';
import KitchenPlaceholder from './ui/pages/KitchenPlaceholder';
import RecipesLibrary from './ui/pages/RecipesLibrary';

function RecipeEditorStub() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Edit Recipe</h1></div>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/recipes" replace />} />
        <Route path="/recipes" element={<RecipesLibrary />} />
        <Route path="/recipes/:id/edit" element={<RecipeEditorStub />} />
        <Route path="/events" element={<EventsPlaceholder />} />
        <Route path="/events/:id/cook" element={<KitchenPlaceholder />} />
        <Route path="*" element={<div className="p-6">Not found.</div>} />
      </Route>
    </Routes>
  );
}
