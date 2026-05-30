import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Users, Trash2, AlertTriangle } from 'lucide-react';
import {
  listGroups,
  listMembers,
  inviteMember,
  removeMember,
  renameGroup,
  deleteGroup,
  TeamsClientError,
  type TeamGroup,
  type TeamMember,
  type InviteResult,
} from '../../core/teams/teamsClient';
import { useTierStore } from '../../state/useTierStore';

// /teams/:id (T5): manage a single team — rename, invite + remove
// members, delete the team. Tier-gated like /teams.

export default function TeamDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tier = useTierStore((s) => s.tier);

  const [group, setGroup] = useState<TeamGroup | null | undefined>(undefined);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [renameMode, setRenameMode] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState<InviteResult | null>(null);

  async function refresh() {
    const [groups, m] = await Promise.all([listGroups(), listMembers()]);
    const found = groups.find((g) => g.id === id) ?? null;
    setGroup(found);
    setMembers(m.filter((x) => x.group_id === id));
    if (found) setRenameValue(found.name);
  }

  useEffect(() => {
    if (tier !== 'enterprise') return;
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load team');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, id]);

  if (tier !== 'enterprise') {
    return <Navigate to="/recipes" replace />;
  }

  if (loadError) {
    return (
      <section className="p-4 md:p-6 max-w-3xl mx-auto">
        <Link to="/teams" className="btn-secondary text-sm inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Teams
        </Link>
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      </section>
    );
  }

  if (group === undefined) {
    return <div className="p-6 text-slate-500">Loading team…</div>;
  }

  if (group === null) {
    return (
      <section className="p-4 md:p-6 max-w-3xl mx-auto">
        <Link to="/teams" className="btn-secondary text-sm inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Teams
        </Link>
        <h1 className="text-xl font-bold">Team not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          This team may have been deleted, or the link is wrong.
        </p>
      </section>
    );
  }

  // `group` is narrowed to TeamGroup from here down.
  const safeGroup: TeamGroup = group;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setActionError(null);
    setLastInvite(null);
    try {
      const out = await inviteMember(email, { groupId: id });
      setLastInvite(out);
      setInviteEmail('');
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(memberEmail: string) {
    if (!window.confirm(`Remove ${memberEmail} from ${group!.name}?`)) return;
    setActionError(null);
    try {
      await removeMember(memberEmail);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Remove failed');
    }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name || name === group!.name) {
      setRenameMode(false);
      return;
    }
    setActionError(null);
    try {
      await renameGroup(id, name);
      setRenameMode(false);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rename failed');
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete team "${group!.name}"? All members will be removed.`)) return;
    setActionError(null);
    try {
      await deleteGroup(id);
      navigate('/teams');
    } catch (err) {
      if (err instanceof TeamsClientError) setActionError(err.message);
      else setActionError('Delete failed');
    }
  }

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center gap-2">
        <Link to="/teams" className="btn-secondary text-sm inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Teams
        </Link>
      </header>

      <div>
        {renameMode && !safeGroup.isDefault ? (
          <form onSubmit={(e) => void handleRename(e)} className="flex items-center gap-2">
            <input
              type="text"
              required
              maxLength={50}
              autoFocus
              value={renameValue}
              onChange={(ev) => setRenameValue(ev.target.value)}
              data-testid="team-detail-rename-input"
              className="input text-2xl font-bold"
            />
            <button type="submit" className="btn-secondary text-sm">Save</button>
            <button
              type="button"
              onClick={() => { setRenameValue(safeGroup.name); setRenameMode(false); }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-accent" aria-hidden="true" />
            <h1 className="text-2xl font-bold" data-testid="team-detail-name">
              {safeGroup.name}
            </h1>
            {!safeGroup.isDefault && (
              <button
                type="button"
                onClick={() => setRenameMode(true)}
                data-testid="team-detail-rename-button"
                className="btn-secondary text-xs"
              >
                Rename
              </button>
            )}
          </div>
        )}
      </div>

      {actionError && (
        <p
          role="alert"
          data-testid="team-detail-error"
          className="text-sm text-red-600 dark:text-red-400 inline-flex items-start gap-1.5"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          {actionError}
        </p>
      )}

      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Invite a member
        </h2>
        <form
          onSubmit={(e) => void handleInvite(e)}
          className="flex flex-wrap gap-2 items-start"
        >
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(ev) => setInviteEmail(ev.target.value)}
            placeholder="member@example.com"
            data-testid="team-detail-invite-email"
            className="input flex-1 min-w-[14rem]"
            aria-label="Member email"
          />
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            data-testid="team-detail-invite-submit"
            className="btn-primary disabled:opacity-60"
          >
            {inviting ? 'Inviting…' : 'Invite'}
          </button>
        </form>
        {lastInvite && (
          <p
            data-testid="team-detail-invite-status"
            className="mt-2 text-xs text-emerald-700 dark:text-emerald-300"
          >
            Invited <strong>{lastInvite.email}</strong> ·{' '}
            {lastInvite.emailStatus === 'sent' && 'email sent'}
            {lastInvite.emailStatus === 'skipped-no-key' && 'email send disabled — copy the link below'}
            {lastInvite.emailStatus === 'failed' && 'email send failed — copy the link below'}
            {lastInvite.emailStatus !== 'sent' && (
              <>
                {': '}
                <a href={lastInvite.acceptUrl} className="underline break-all">
                  {lastInvite.acceptUrl}
                </a>
              </>
            )}
          </p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Members ({members.length})
        </h2>
        {members.length === 0 ? (
          <p
            data-testid="team-detail-empty"
            className="text-sm text-slate-500 italic"
          >
            No members yet. Invite the first chef above.
          </p>
        ) : (
          <ul
            data-testid="team-detail-members-list"
            className="divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            {members.map((m) => (
              <li
                key={m.member_email}
                data-testid={`team-detail-row-${m.member_email}`}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.member_email}</p>
                  <p className="text-xs text-slate-500">
                    {m.accepted_at ? 'Accepted' : 'Pending invite'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemove(m.member_email)}
                  data-testid={`team-detail-remove-${m.member_email}`}
                  className="btn-secondary text-xs"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!safeGroup.isDefault && (
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => void handleDelete()}
            data-testid="team-detail-delete-team"
            className="btn-secondary text-sm inline-flex items-center gap-1.5 text-red-600 dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete team
          </button>
        </div>
      )}
    </section>
  );
}
