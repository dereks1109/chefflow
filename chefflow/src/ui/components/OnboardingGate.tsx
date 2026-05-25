import { useState, type ReactNode } from 'react';
import { useUser } from '@clerk/clerk-react';
import OnboardingSheet from './OnboardingSheet';

interface Props {
  children: ReactNode;
}

// Gate the rest of the signed-in app behind a one-time setup sheet.
//
// Truth source: useUser().user.publicMetadata.onboardingComplete — set by
// the worker after the sheet's Save or Skip. We read it from the Clerk
// session cache (no extra round-trip) so the gate is free for returning
// users.
//
// The optimistic flag handles the post-submit window: Clerk's frontend
// session cache lags the worker's PATCH by one user.reload() tick, so we
// flip `localDone` true the moment the sheet calls onDone() to avoid a
// flash of the sheet between the worker call and Clerk's metadata refresh.

export default function OnboardingGate({ children }: Props) {
  const { user, isLoaded } = useUser();
  const [localDone, setLocalDone] = useState(false);

  if (!isLoaded) return null;
  // Signed-out: nothing for us to gate. (SignInGate handles signed-out UX.)
  if (!user) return <>{children}</>;

  const meta = user.publicMetadata as { onboardingComplete?: unknown } | undefined;
  const done = localDone || meta?.onboardingComplete === true;

  if (done) return <>{children}</>;

  return (
    <OnboardingSheet
      onDone={() => {
        setLocalDone(true);
        // Refresh Clerk's cached user object so subsequent reads see the
        // new publicMetadata.onboardingComplete. Fire-and-forget — even if
        // it fails, localDone keeps the sheet down for this session.
        void user.reload?.().catch(() => {
          /* no-op */
        });
      }}
    />
  );
}
