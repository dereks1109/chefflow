// Worker-side observability helpers. The privacy policy comment in index.ts
// is the contract: never log request bodies on auth-gated endpoints. This
// module exposes the building blocks (request_id generation, payload-free
// Sentry capture, the withSentry wrapper config) so route handlers can
// adopt them without re-deriving the scrubbing rules.

import * as Sentry from '@sentry/cloudflare';

const SENSITIVE_URL_PATTERNS: RegExp[] = [
  /\/api\/sync\//,
  /\/api\/account\b/,
  /\/api\/llm\//,
];

function urlIsSensitive(url: string): boolean {
  return SENSITIVE_URL_PATTERNS.some((re) => re.test(url));
}

// Strip the body off any Sentry-captured event whose request URL hits an
// auth-gated endpoint. Exported for unit tests.
interface SentryRequestLike { url?: string; data?: unknown }
interface SentryEventLike { request?: SentryRequestLike }
export function scrubWorkerEvent<T extends SentryEventLike>(event: T): T {
  if (event.request?.url && urlIsSensitive(event.request.url)) {
    event.request = { ...event.request, data: undefined };
  }
  return event;
}

// Stable request id for log correlation. Surfaced as the `x-request-id`
// response header so a user can paste it into a support email and we can
// find the matching server-side breadcrumb.
export function newRequestId(): string {
  return crypto.randomUUID();
}

interface SentryEnv {
  SENTRY_DSN?: string;
}

// Build the Sentry options object that `withSentry(optionsCallback, handler)`
// expects. Returns null when no DSN is set — the caller can branch on it to
// skip wrapping entirely on local `wrangler dev`.
export function sentryOptions(env: SentryEnv): Record<string, unknown> | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend(event: SentryEventLike) {
      return scrubWorkerEvent(event);
    },
  };
}

// Capture an exception with the request id attached. Safe to call even when
// Sentry isn't initialised — `Sentry.captureException` is a no-op when the
// SDK has no client.
export function captureWorkerException(err: unknown, requestId: string): void {
  Sentry.withScope((scope) => {
    scope.setTag('request_id', requestId);
    Sentry.captureException(err);
  });
}

// Re-export for the default-export wrap in index.ts.
export { Sentry };
