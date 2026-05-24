import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import AppErrorBoundary from './ui/components/AppErrorBoundary';
import { initSentry } from './observability/sentry';
import './index.css';

// Observability — no-op when VITE_SENTRY_DSN is unset, so dev / preview
// builds without a DSN run cleanly. See chefflow/src/observability/sentry.ts
// for the PII scrubbing policy applied to every captured event.
initSentry();

const publishableKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? '';
if (!publishableKey) {
  // eslint-disable-next-line no-console
  console.warn('VITE_CLERK_PUBLISHABLE_KEY is missing — auth UI will fail to mount.');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ClerkProvider publishableKey={publishableKey}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClerkProvider>
    </AppErrorBoundary>
  </StrictMode>
);
