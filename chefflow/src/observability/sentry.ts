import * as Sentry from '@sentry/react';

// Single source of truth for client-side observability. The init is gated on
// VITE_SENTRY_DSN so dev / preview builds without a DSN are a complete no-op.
//
// Scrubbing policy (mirrors chefflow-worker/src/index.ts privacy comment):
// recipe ingredients, event contact info, dietary notes, and recipe content
// must never leave the user's browser inside an error report. We enforce
// this in three places:
//   1. sendDefaultPii: false      — Sentry's own opt-out for PII heuristics.
//   2. beforeSend                 — strips request.data on /api/{sync,account,llm}/*.
//   3. beforeBreadcrumb           — drops ui.input + console breadcrumb categories
//                                   entirely (form values and console.log content
//                                   are both PII risks for this app).
//
// If you add a new auth-gated route, extend SENSITIVE_URL_PATTERNS below.

const SENSITIVE_URL_PATTERNS: RegExp[] = [
  /\/api\/sync\//,
  /\/api\/account\b/,
  /\/api\/llm\//,
];

function urlIsSensitive(url: string | undefined): boolean {
  if (!url) return false;
  return SENSITIVE_URL_PATTERNS.some((re) => re.test(url));
}

interface SentryRequestLike {
  url?: string;
  data?: unknown;
}

interface SentryEventLike {
  request?: SentryRequestLike;
  extra?: Record<string, unknown>;
}

// Exported for unit tests so we can assert the scrubber behaves correctly
// without standing up the full Sentry SDK.
export function scrubEvent<T extends SentryEventLike>(event: T): T {
  // Strip request body for any sensitive endpoint. Sentry sometimes attaches
  // it via the BrowserTracing integration when an XHR/fetch errors out.
  if (event.request && urlIsSensitive(event.request.url)) {
    event.request = { ...event.request, data: undefined };
  }
  // Defensive: never carry `extra.body` / `extra.payload` regardless of URL.
  if (event.extra) {
    const safeExtra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(event.extra)) {
      if (k === 'body' || k === 'payload' || k === 'request') continue;
      safeExtra[k] = v;
    }
    event.extra = safeExtra;
  }
  return event;
}

interface BreadcrumbLike {
  category?: string;
  data?: { url?: string; body?: unknown; input?: unknown } & Record<string, unknown>;
}

// `ui.input` carries form field values verbatim — too risky for this app.
// `console` carries arbitrary console.log content. Drop both wholesale.
// `fetch` / `xhr` we keep, but strip body for sensitive URLs.
export function scrubBreadcrumb(breadcrumb: BreadcrumbLike): BreadcrumbLike | null {
  if (breadcrumb.category === 'ui.input') return null;
  if (breadcrumb.category === 'console') return null;

  if (
    (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') &&
    breadcrumb.data
  ) {
    if (urlIsSensitive(breadcrumb.data.url)) {
      const { body: _body, input: _input, ...safeData } = breadcrumb.data;
      breadcrumb.data = safeData;
    }
  }
  return breadcrumb;
}

let initialised = false;

export function initSentry(): void {
  if (initialised) return;
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
  if (!dsn) return; // no DSN → no init → no Sentry. Safe by default.

  Sentry.init({
    dsn,
    release: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev',
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // Trace sampling kept low — we don't need transactions today, just errors.
    tracesSampleRate: 0.1,
    // No session replays in v1 — they capture DOM mutations and form fields.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumb(breadcrumb);
    },
  });
  initialised = true;
}

// Convenience re-export so callers don't pull @sentry/react directly.
export { Sentry };
