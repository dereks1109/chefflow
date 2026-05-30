import { useEffect, useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { Users, Plus, X, AlertTriangle } from 'lucide-react';
import {
  listGroups,
  createGroup,
  listMembers,
  TeamsClientError,
  type TeamGroup,
  type TeamMember,
} from '../../core/teams/teamsClient';
import { useTierStore } from '../../state/useTierStore';

// /teams (T5): top-nav landing for the Enterprise team-share feature.
// Lists the chef's teams as cards (member count + Manage link); a
// "+ New team" button opens a small modal to create the first one.
//
// Tier gate: non-Enterprise chefs are redirected to /recipes. The
// TopNav link is already gated to Enterprise, but the redirect here
// covers the deep-link case.

export default function TeamsList() {
  const tier = useTierStore((s) => s.tier);
  const navigate = useNavigate();
  const [groups, setGroups] = useState<TeamGroup[] | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (tier !== 'enterprise') return;
    let cancelled = false;
    void (async () => {
      try {
        const [g, m] = await Promise.all([listGroups(), listMembers()]);
        if (!cancelled) { setGroups(g); setMembers(m); }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load teams');
      }
    })();
    return () => { cancelled = true; };
  }, [tier]);

  if (tier !== 'enterprise') {
    return <Navigate to="/recipes" replace />;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createGroup(name);
      navigate(`/teams/${created.id}`);
    } catch (err) {
      if (err instanceof TeamsClientError) setCreateError(err.message);
      else setCreateError('Create failed');
    } finally {
      setCreating(false);
    }
  }

  function memberCountFor(groupId: string): number {
    return members.filter((m) => m.group_id === groupId).length;
  }

  return (
    <section className="p-4 md:p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-accent" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Teams</h1>
        </div>
        <button
          type="button"
          onClick={() => { setNewName(''); setCreateError(null); setCreateOpen(true); }}
          data-testid="teams-new-team-button"
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New team
        </button>
      </header>

      {loadError && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {loadError}
        </p>
      )}

      {!groups && !loadError && (
        <p className="text-sm text-slate-500">Loading teams…</p>
      )}

      {groups && groups.length === 0 && (
        <div
          data-testid="teams-empty-state"
          className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center"
        >
          <Users className="h-10 w-10 mx-auto text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-base font-medium">No teams yet</p>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            Create your first team to start inviting members. You decide
            which recipes, events, and menus each team can see when you
            edit them.
          </p>
          <button
            type="button"
            onClick={() => { setNewName(''); setCreateError(null); setCreateOpen(true); }}
            className="mt-4 btn-primary inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create your first team
          </button>
        </div>
      )}

      {groups && groups.length > 0 && (
        <ul
          data-testid="teams-list"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {groups.map((group) => (
            <li
              key={group.id}
              data-testid={`teams-card-${group.id}`}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 hover:border-accent transition-colors"
            >
              <Link to={`/teams/${group.id}`} className="block">
                <p className="font-semibold truncate">{group.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {memberCountFor(group.id)} member
                  {memberCountFor(group.id) === 1 ? '' : 's'}
                </p>
                <p className="mt-3 text-xs text-accent">Manage →</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="teams-create-title"
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <h2 id="teams-create-title" className="font-semibold inline-flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden="true" />
                New team
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close"
                className="touch-target px-2 rounded-md text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>
            <form onSubmit={(e) => void handleCreate(e)} className="px-5 py-4 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Team name</span>
                <input
                  type="text"
                  autoFocus
                  required
                  maxLength={50}
                  value={newName}
                  onChange={(ev) => setNewName(ev.target.value)}
                  placeholder="e.g. Morning shift"
                  data-testid="teams-create-name-input"
                  className="input mt-1"
                />
              </label>
              {createError && (
                <p
                  role="alert"
                  data-testid="teams-create-error"
                  className="text-xs text-red-600 dark:text-red-400 inline-flex items-start gap-1.5"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  {createError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  data-testid="teams-create-submit"
                  className="btn-primary text-sm disabled:opacity-60"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
