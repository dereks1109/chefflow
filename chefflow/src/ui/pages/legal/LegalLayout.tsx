import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChefHat, ArrowLeft } from 'lucide-react';

interface LegalLayoutProps {
  title: string;
  lastUpdated?: string;
  children: ReactNode;
}

// Plain shell used by the four legal pages. Lives outside the Clerk auth gates
// in App.tsx so visitors can read terms / privacy / cookies / disclaimer
// without signing in.
export default function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-surface-0 text-slate-900 dark:text-slate-100">
      <header className="fixed top-0 left-0 right-0 z-30 border-b border-slate-200 dark:border-[rgba(255,255,255,0.06)] bg-white/90 dark:bg-surface-0/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-medium hover:text-accent"
          >
            <ChefHat className="h-5 w-5 text-accent" aria-hidden="true" />
            <span>ChefFlow</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to app
          </Link>
        </div>
      </header>

      <main className="flex-1 pt-16">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{title}</h1>
          {lastUpdated && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Last updated: {lastUpdated}</p>
          )}
          <div className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed">
            {children}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-[rgba(255,255,255,0.06)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
          <Link to="/terms" className="hover:text-accent">Terms</Link>
          <Link to="/privacy" className="hover:text-accent">Privacy</Link>
          <Link to="/cookies" className="hover:text-accent">Cookies</Link>
          <Link to="/disclaimer" className="hover:text-accent">Disclaimer</Link>
        </div>
      </footer>
    </div>
  );
}
