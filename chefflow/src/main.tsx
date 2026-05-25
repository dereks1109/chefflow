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
  // In E2E mode the app renders directly — Clerk is bypassed. App.tsx must
  // also skip <SignedIn>/<SignedOut> gating; see App.tsx e2eMode branch.
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App e2eMode />
      </BrowserRouter>
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
