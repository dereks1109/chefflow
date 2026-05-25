import { useState } from 'react';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { Download, Trash2 } from 'lucide-react';
import Button from './primitives/Button';
import { exportAccount } from '../../core/account/exportClient';
import { deleteAccount } from '../../core/account/deleteClient';

// Settings → Data & privacy section. Exposes the GDPR rights:
//   - Article 20 portability: download all your D1 rows as JSON
//   - Article 17 erasure: cascade-delete D1 + community + Clerk user
//
// Designed to slot into SettingsPage as a self-contained section. Holds
// its own UI state (busy spinners, confirm modal) so the parent stays
// simple.

export default function AccountDataPanel() {
  const { getToken } = useAuth();
  const clerk = useClerk();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      const payload = await exportAccount({ getToken });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chefflow-export-${payload.userId}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount({ getToken });
      // Server has deleted the Clerk user; sign-out locally so the SPA's
      // cached session is cleared and the user lands on the SignInGate.
      await clerk.signOut();
      // Hard-reload to clear Dexie + Zustand + service-worker cache.
      window.location.assign('/');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Deletion failed');
      setDeleting(false);
    }
  }

  return (
    <section
      aria-labelledby="settings-data-heading"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 md:p-5"
    >
      <h2 id="settings-data-heading" className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
        Data and privacy
      </h2>
      <p className="mt-2 text-xs text-slate-500">
        Your rights under UK GDPR. Export pulls every row we hold for your
        account; Delete removes everything irreversibly.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconLeft={<Download className="h-4 w-4" />}
            onClick={() => void handleExport()}
            disabled={exporting}
            data-testid="account-export"
          >
            {exporting ? 'Preparing export…' : 'Export my data (JSON)'}
          </Button>
          {exportError && (
            <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{exportError}</p>
          )}
        </div>

        <div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            iconLeft={<Trash2 className="h-4 w-4" />}
            onClick={() => setDeleteOpen(true)}
            data-testid="account-delete-open"
          >
            Delete my account
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            Removes your recipes, events, menus, community recipes, and account
            credentials. Cannot be undone.
          </p>
        </div>
      </div>

      {deleteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-heading"
          data-testid="account-delete-modal"
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-1 p-6 shadow-2xl">
            <h3 id="delete-account-heading" className="text-lg font-semibold text-red-600 dark:text-red-400">
              Delete your account?
            </h3>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
              This deletes every recipe, event, menu, allergen audit row, and
              community publication tied to your account. Your Clerk login
              credentials are also removed. There is no recovery.
            </p>
            <label className="block mt-4">
              <span className="text-xs text-slate-500">
                Type <code>DELETE</code> to confirm
              </span>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                data-testid="account-delete-confirm-input"
                className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-surface-2 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </label>
            {deleteError && (
              <p role="alert" data-testid="account-delete-error" className="mt-3 text-xs text-red-600 dark:text-red-400">
                {deleteError}
              </p>
            )}
            <div className="mt-6 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); setDeleteError(null); }}
                disabled={deleting}
                data-testid="account-delete-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={deleting || deleteConfirm !== 'DELETE'}
                data-testid="account-delete-confirm"
              >
                {deleting ? 'Deleting…' : 'Delete forever'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
