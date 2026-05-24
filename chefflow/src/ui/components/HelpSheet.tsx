import { useEffect, useState } from 'react';
import { LifeBuoy, Mail, X } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Per the support axis plan: founder-mode support — one mailto, no inbox
// tool yet. The textarea pre-fills the mail draft with the user's email +
// the app version + the current route so triage doesn't start cold.
const SUPPORT_EMAIL = 'support@chefflow.com';

// Vite injects this at build time. Falls back to "dev" so messages from
// `npm run dev` are still identifiable.
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';

export default function HelpSheet({ open, onClose }: Props) {
  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? '';
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function buildMailto(): string {
    const route = typeof window !== 'undefined' ? window.location.pathname : '/';
    const lines = [
      draft.trim() || '(describe what you were doing and what went wrong)',
      '',
      '---',
      `From: ${userEmail || '(no email)'}`,
      `Version: ${APP_VERSION}`,
      `Route: ${route}`,
    ];
    const subject = encodeURIComponent('ChefFlow — help / feedback');
    const body = encodeURIComponent(lines.join('\n'));
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-sheet-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 id="help-sheet-title" className="font-semibold inline-flex items-center gap-2">
            <LifeBuoy className="h-4 w-4" aria-hidden="true" />
            Help &amp; feedback
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="touch-target px-2 rounded-md text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            ChefFlow is built by a one-person team. Drop a note and I'll usually reply within two business days.
          </p>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">What's going on?</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              placeholder="Bug, feature idea, question — anything. Be specific (which dish, which step) if you can."
              className="input mt-1 resize-y"
              aria-label="Message to support"
            />
          </label>

          <p className="text-xs text-slate-500">
            Clicking <strong>Open email draft</strong> opens your mail client with your message pre-filled,
            along with your email address, app version, and current page so I can find your data fast. Nothing
            is sent automatically — you review and send from your own inbox.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <a
            href={buildMailto()}
            className="btn-primary text-sm inline-flex items-center gap-2"
            onClick={() => {
              // Close after opening — the mail app handles the rest.
              setTimeout(onClose, 100);
            }}
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            Open email draft
          </a>
        </footer>
      </div>
    </div>
  );
}
