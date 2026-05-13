import { Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Navigate to="/recipes" replace />} />
        <Route path="*" element={<PlaceholderShell />} />
      </Routes>
    </div>
  );
}

function PlaceholderShell() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">ChefFlow</h1>
      <p className="text-slate-600 dark:text-slate-400">Booting up…</p>
    </main>
  );
}
