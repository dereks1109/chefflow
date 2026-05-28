import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Car, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProfileStore } from '../../state/useProfileStore';
import { estimateCommute, type CommuteEstimateResult } from '../../core/commute/commuteClient';

// ---------------------------------------------------------------------------
// CommuteBanner — renders above the Workflow timeline. When the chef has a
// homeAddress set AND the event has a `location`, asks the worker to
// estimate driving time + distance via Google Maps Distance Matrix, then
// shows "Leave home by X to arrive Y minutes before service" with the
// derived "leave by" timestamp.
//
// Hidden silently when:
//   - chef has no home address (nothing to compute from)
//   - event has no location (nothing to compute to)
//   - worker returns no-key (Maps API key not configured)
//   - worker returns maps-failed / network error (logged in console)
//
// The actual schedule isn't modified — the LLM scheduler stays
// kitchen-time-only. This is a chef-facing "logistics" reminder.
// ---------------------------------------------------------------------------

interface Props {
  eventLocation?: string;
  serveAt?: string;
}

const ARRIVE_BUFFER_MIN = 30; // chef wants to be on-site 30 min before service

export default function CommuteBanner({ eventLocation, serveAt }: Props) {
  const homeAddress = useProfileStore((s) => s.homeAddress);
  const trimmedHome = (homeAddress ?? '').trim();
  const trimmedLoc = (eventLocation ?? '').trim();
  // Defer useAuth() to a sub-component so we never call it (and never
  // crash in a no-ClerkProvider test) when the banner has nothing to
  // do. Hooks must be called unconditionally per render — so we
  // conditionally mount the sub-component instead.
  if (!trimmedHome || !trimmedLoc) return null;
  return <CommuteFetcher home={trimmedHome} destination={trimmedLoc} serveAt={serveAt} />;
}

interface FetcherProps {
  home: string;
  destination: string;
  serveAt?: string;
}

function CommuteFetcher({ home, destination, serveAt }: FetcherProps) {
  const { getToken } = useAuth();
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ok'; result: CommuteEstimateResult & { ok: true } }
    | { kind: 'hidden' }
  >({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    void estimateCommute({ getToken, origin: home, destination }).then((res) => {
      if (cancelled) return;
      if (res.ok) setState({ kind: 'ok', result: res });
      else {
        if (res.fallback !== 'no-key') {
          // eslint-disable-next-line no-console
          console.warn('[commute] estimate failed:', res.fallback, res.message);
        }
        setState({ kind: 'hidden' });
      }
    });
    return () => { cancelled = true; };
  }, [home, destination, getToken]);

  if (state.kind === 'hidden') return null;
  if (state.kind === 'idle') return null;

  if (state.kind === 'loading') {
    return (
      <div
        className="mb-3 flex items-start gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-surface-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 print:hidden"
        data-testid="commute-banner-loading"
      >
        <Car className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>Estimating commute…</span>
      </div>
    );
  }

  const minutes = Math.round(state.result.durationSeconds / 60);
  const km = (state.result.distanceMeters / 1000).toFixed(1);
  let leaveByLine: string | null = null;
  if (serveAt) {
    const serve = Date.parse(serveAt);
    if (Number.isFinite(serve)) {
      const leaveByMs = serve - (minutes + ARRIVE_BUFFER_MIN) * 60_000;
      const leaveBy = new Date(leaveByMs);
      leaveByLine = `Leave by ${leaveBy.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} to arrive ${ARRIVE_BUFFER_MIN} min before service.`;
    }
  }
  return (
    <div
      role="note"
      data-testid="commute-banner"
      className="mb-3 flex items-start gap-2 rounded-md border border-sky-200 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-900/20 px-3 py-2 text-xs text-sky-900 dark:text-sky-200 print:hidden"
    >
      <Car className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <strong>{minutes} min</strong> drive ({km} km) from your home to{' '}
        <span className="font-mono">{state.result.resolvedDestination}</span>.{' '}
        {leaveByLine}
      </span>
    </div>
  );
}

/** Inline empty-state CTA used by SettingsPage when the chef hasn't set
 *  a home address yet. Kept here so the copy stays adjacent to the
 *  banner that consumes the data. */
export function CommuteSettingsHint() {
  return (
    <p className="text-xs text-slate-500 inline-flex items-center gap-1">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Set this and we'll show driving time + a "leave by" timestamp on
      each event's workflow page. Open the{' '}
      <Link to="/settings" className="text-accent hover:underline">Settings</Link>{' '}
      page if you got here some other way.
    </p>
  );
}
