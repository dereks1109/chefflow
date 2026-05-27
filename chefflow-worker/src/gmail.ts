// Gmail API client — refresh-token → access-token exchange + message
// list/get. Used by `gmailDigest.ts` for the daily summary cron.
//
// OAuth model:
//   - The chef (admin@chefflow.uk) grants Gmail.readonly scope ONCE via
//     a Google Cloud OAuth consent flow (see docs/operations/gmail-oauth-setup.md).
//     That flow yields a refresh token, stored as a Cloudflare worker
//     secret (GOOGLE_OAUTH_REFRESH_TOKEN). The client_id + client_secret
//     for the OAuth app are also worker secrets.
//   - Every cron firing, the worker exchanges the refresh token for a
//     short-lived access token (~1h TTL), then calls the Gmail API with
//     it. The refresh token itself never expires unless the chef
//     revokes consent in their Google account.
//
// Scope chosen: `https://www.googleapis.com/auth/gmail.readonly`. The
// worker never sends mail via Gmail (Resend handles outbound); read-
// only is the minimum scope to summarise the inbox.

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class GmailError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'GmailError';
  }
}

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  /** RFC2822 date header — undefined when the message is missing it. */
  date?: string;
  from?: string;
  to?: string;
  subject?: string;
  /** Plain-text snippet from Gmail (~140 chars). */
  snippet: string;
}

export interface GmailClientDeps {
  fetchImpl?: typeof fetch;
}

/** Exchange the long-lived refresh token for a fresh access token.
 *  Cached upstream by the caller for a single cron-firing's worth of
 *  API calls — we never persist the access token. */
export async function getAccessToken(
  creds: GmailCredentials,
  deps: GmailClientDeps = {},
): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GmailError(
      `OAuth token refresh failed (${res.status}): ${detail.slice(0, 200)}`,
      res.status,
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new GmailError('OAuth response missing access_token', 500);
  }
  return json.access_token;
}

/** Fetch message ids matching the Gmail search query. We don't pull the
 *  full bodies here — `getMessage` does that on demand to keep the
 *  worker-side payload predictable. */
export async function listMessageIds(
  accessToken: string,
  query: string,
  maxResults = 50,
  deps: GmailClientDeps = {},
): Promise<Array<{ id: string; threadId: string }>> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GmailError(
      `Gmail list failed (${res.status}): ${detail.slice(0, 200)}`,
      res.status,
    );
  }
  const json = (await res.json()) as { messages?: Array<{ id: string; threadId: string }> };
  return json.messages ?? [];
}

interface RawGmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

function pickHeader(message: RawGmailMessage, name: string): string | undefined {
  return message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

/** Fetch one message in `metadata` format — headers + snippet only.
 *  Full bodies aren't needed for the digest summariser and cost more
 *  Gmail-API quota. */
export async function getMessage(
  accessToken: string,
  id: string,
  deps: GmailClientDeps = {},
): Promise<GmailMessageSummary> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GmailError(
      `Gmail get(${id}) failed (${res.status}): ${detail.slice(0, 200)}`,
      res.status,
    );
  }
  const raw = (await res.json()) as RawGmailMessage;
  return {
    id: raw.id,
    threadId: raw.threadId,
    snippet: raw.snippet ?? '',
    date: pickHeader(raw, 'Date'),
    from: pickHeader(raw, 'From'),
    to: pickHeader(raw, 'To'),
    subject: pickHeader(raw, 'Subject'),
  };
}
