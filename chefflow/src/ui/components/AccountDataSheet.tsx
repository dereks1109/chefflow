import { useEffect, useState } from 'react';
import { Database, Download, Trash2, X } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { exportAccountData, deleteAccountData } from '../../db/syncClient';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = 'idle' | 'exporting' | 'deleting' | 'error';

export default function AccountDataSheet({ open, onClose }: Props) {
  const { user } = useUser();
  const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? '';
  const [confirmText, setConfirmText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmText('');
    setStatus('idle');
    setError(null);
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

  async function handleExport() {
    if (status !== 'idle') return;
    setStatus('exporting');
    setError(null);
    try {
      const data = await exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `chefflow-export-${data.ownerId}-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  const canDelete =
    primaryEmail.length > 0 &&
    confirmText.trim().toLowerCase() === primaryEmail.toLowerCase() &&
    status === 'idle';

  async function handleDelete() {
    if (!canDelete) return;
    if (
      !window.confirm(
        'This will permanently delete your ChefFlow account, all your recipes, events, and preferences from both your browser and the server. This cannot be undone. Continue?',
      )
    ) {
      return;
    }
    setStatus('deleting');
    setError(null);
    try {
      await deleteAccountData();
      // Delete the Clerk account itself. user.delete() signs the user out
      // automatically; the App's signed-out gate will then show SignInScreen.
      if (user) {
        await user.delete();
      }
      // Belt-and-braces redirect — Clerk usually handles this, but if the
      // user is still on a protected route, force them home.
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-data-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 id="account-data-title" className="font-semibold inline-flex items-center gap-2">
            <Database className="h-4 w-4" aria-hidden="true" />
            Account data
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

        <div className="px-5 py-4 space-y-6 text-sm">
          <section className="space-y-2">
            <h3 className="font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-2">
              <Download className="h-4 w-4" aria-hidden="true" />
              Export my data
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              Download a JSON file with every recipe, event, and preference stored on your account.
            </p>
            <button
              type="button"
              onClick={handleExport}
              disabled={status !== 'idle'}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              {status === 'exporting' ? 'Exporting…' : 'Download export'}
            </button>
          </section>

          <section className="space-y-2 pt-4 border-t border-rose-200 dark:border-rose-900/40">
            <h3 className="font-medium text-rose-700 dark:text-rose-400 inline-flex items-center gap-2">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete my account
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              Permanently removes your ChefFlow account and every recipe, event, and preference owned
              by it — both on this device and on the server. This cannot be undone.
            </p>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">
                Type your email (<span className="font-mono">{primaryEmail || 'unknown'}</span>) to confirm
              </span>
              <input
                type="email"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={primaryEmail || 'your email'}
                autoComplete="off"
                className="input mt-1 font-mono"
                aria-label="Confirm by typing your email"
              />
            </label>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-md px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'deleting' ? 'Deleting…' : 'Delete my account permanently'}
            </button>
          </section>

          {error && (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
