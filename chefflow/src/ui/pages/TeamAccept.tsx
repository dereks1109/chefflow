import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import { Users, Check, AlertTriangle, LogIn } from 'lucide-react';
import { acceptInvite, TeamsClientError } from '../../core/teams/teamsClient';

// /teams/accept?token=… — the deep link in the invite email lands here.
// Reads the token from the URL, POSTs to /api/teams/accept once the user
// is signed in (Clerk's openSignIn modal handles the auth step inline),
// then shows a success state with a CTA to browse the shared library.
//
// The worker requires the JWT's Clerk email to match the invite's
// member_email (Phase 2) so a forwarded link can't be claimed by an
// attacker account — we surface the resulting 403 with a clear message.

type Status =
  | { kind: 'idle' }
  | { kind: 'no-token' }
  | { kind: 'needs-signin' }
  | { kind: 'accepting' }
  | { kind: 'accepted'; memberEmail: string }
  | { kind: 'error'; message: string; status?: number };

export default function TeamAccept() {
  const [searchParams] = useSearchParams();
  const { isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    if (!isLoaded) return;
    if (!token) {
      setStatus({ kind: 'no-token' });
      return;
    }
    if (!isSignedIn) {
      setStatus({ kind: 'needs-signin' });
      return;
    }
    // Auto-accept once we have a token + signed-in user. The accept
    // endpoint is idempotent for the same (token, memberUserId) pair —
    // re-visiting the link after acceptance is a no-op error we treat
    // as success (the user is already a member).
    setStatus({ kind: 'accepting' });
    acceptInvite(token)
      .then((res) => setStatus({ kind: 'accepted', memberEmail: res.memberEmail }))
      .catch((err: unknown) => {
        const e = err as TeamsClientError;
        setStatus({ kind: 'error', message: e.message ?? 'Accept failed', status: e.status });
      });
  }, [isLoaded, isSignedIn, token]);

  return (
    <section className="max-w-md mx-auto p-4 md:p-6">
      <div
        data-testid="team-accept-card"
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-6 text-center"
      >
        <Users className="h-8 w-8 mx-auto text-accent" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">Join a ChefFlow team</h1>

        {status.kind === 'idle' && (
          <p className="mt-3 text-sm text-slate-500">Checking your invitation…</p>
        )}

        {status.kind === 'no-token' && (
          <>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              No invite token in the URL. Open the link from your invitation
              email — it should include <code>?token=…</code>.
            </p>
            <Link to="/" className="mt-4 btn-secondary inline-flex">Back to ChefFlow</Link>
          </>
        )}

        {status.kind === 'needs-signin' && (
          <>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Sign in with the email your invite was sent to. We'll add you to
              the team as soon as you're signed in.
            </p>
            <button
              type="button"
              onClick={() => clerk.openSignIn?.()}
              data-testid="team-accept-signin"
              className="mt-4 btn-primary inline-flex items-center gap-1.5"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign in
            </button>
          </>
        )}

        {status.kind === 'accepting' && (
          <p className="mt-3 text-sm text-slate-500">Accepting your invitation…</p>
        )}

        {status.kind === 'accepted' && (
          <>
            <Check className="h-6 w-6 mx-auto mt-3 text-emerald-600" aria-hidden="true" />
            <p data-testid="team-accept-success" className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              You're in. <strong>{status.memberEmail}</strong> is now a viewer on
              this team — the owner's recipes and events will sync to your
              library on the next pull.
            </p>
            <Link to="/recipes" className="mt-4 btn-primary inline-flex">Browse shared recipes</Link>
          </>
        )}

        {status.kind === 'error' && (
          <>
            <AlertTriangle className="h-6 w-6 mx-auto mt-3 text-amber-600" aria-hidden="true" />
            <p data-testid="team-accept-error" role="alert" className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              {status.message}
            </p>
            <Link to="/" className="mt-4 btn-secondary inline-flex">Back to ChefFlow</Link>
          </>
        )}
      </div>
    </section>
  );
}
