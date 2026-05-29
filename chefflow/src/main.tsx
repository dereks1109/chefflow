import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import './index.css';

const publishableKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? '';
// E2E_MODE skips Clerk entirely so Playwright tests can exercise the app
// without a live Clerk account. NEVER set this in production builds.
const e2eMode = (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
const root = createRoot(document.getElementById('root')!);

if (e2eMode) {
  // E2E mode: bypass Clerk's auth flow BUT still mount the provider so
  // hooks like useUser() / useClerk() don't throw inside components
  // such as TopNav and MobileTopBar. With no Clerk session, useUser
  // returns { isSignedIn: false }, and components that need to act as
  // "signed in" for the test suite check `import.meta.env.VITE_E2E_MODE`
  // to override behaviour (see useAuthGate's useIsGuest, TopNav's
  // `showSignedInChrome = isE2E || isSignedIn`, etc.).
  //
  // The publishable key is the same dev key used in normal builds —
  // Clerk's SDK initialises but does no real auth work because no
  // sign-in flow is triggered. Fallback to the public dev key from
  // .env.production (tracked in git, safe to inline) so E2E never
  // hard-fails when .env.local is missing the key. Clerk's strict
  // format validation rejects random placeholder strings, so the
  // fallback has to be a real-shaped pk_test_*.
  const e2eKey = publishableKey || 'pk_test_ZW5nYWdpbmctYmF0LTUuY2xlcmsuYWNjb3VudHMuZGV2JA';
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={e2eKey}>
        <BrowserRouter>
          <App e2eMode />
        </BrowserRouter>
      </ClerkProvider>
    </StrictMode>,
  );
} else if (!publishableKey) {
  // Clerk throws on an empty publishableKey, which used to leave the page
  // blank. Render an explicit error instead so deploys without env vars are
  // visibly broken rather than silently broken.
  // eslint-disable-next-line no-console
  console.error('VITE_CLERK_PUBLISHABLE_KEY is missing — see the on-screen instructions.');
  root.render(
    <StrictMode>
      <MissingEnvScreen
        variable="VITE_CLERK_PUBLISHABLE_KEY"
        hint="Add it under Settings → Variables and Secrets in the Cloudflare project, then redeploy."
      />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={publishableKey}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClerkProvider>
    </StrictMode>,
  );
}

function MissingEnvScreen({ variable, hint }: { variable: string; hint: string }) {
  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#0b0b0b',
        color: '#f5f5f5',
      }}
    >
      <div style={{ maxWidth: '32rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          ChefFlow can't start — missing build-time configuration.
        </h1>
        <p style={{ opacity: 0.85, lineHeight: 1.55 }}>
          The environment variable <code style={{ background: '#1f1f1f', padding: '0.1rem 0.35rem', borderRadius: '0.25rem' }}>{variable}</code>{' '}
          wasn't set when this build ran, so authentication can't initialise and the rest of the app
          can't load.
        </p>
        <p style={{ opacity: 0.85, lineHeight: 1.55, marginTop: '0.75rem' }}>{hint}</p>
        <p style={{ opacity: 0.6, lineHeight: 1.55, marginTop: '1.5rem', fontSize: '0.85rem' }}>
          Vite bakes <code>VITE_*</code> values into the bundle at build time, so adding the variable
          requires triggering a new build (push a commit or click <em>Retry deployment</em>).
        </p>
      </div>
    </div>
  );
}
