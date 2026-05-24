// Contact-form handler. Validates the payload, performs IP-rate-limiting via
// the same KV namespace used elsewhere in the worker, and persists the
// submission to KV so the admin dashboard can list them.
//
// No external mail provider: by design, submissions stay inside Cloudflare so
// there's no third-party API key to manage and no DNS to set up. The admin
// view at /admin/contact-submissions returns the list newest-first.

const KEY_SUBMISSION_PREFIX = 'contact:s:';
const KEY_INDEX = 'contact:i:byCreatedDesc';

const RATE_LIMIT_PREFIX = 'contact:rl:';
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60; // 10 min
const RATE_LIMIT_MAX = 3;

// Trim accepted screenshot payload. ContactPage downscales to 1600px JPEG
// before send, but cap defensively at ~2 MB base64 so a hostile client can't
// flood KV (Cloudflare KV has a 25 MB value cap, but we want submissions to
// stay small enough to list cheaply).
const MAX_SCREENSHOT_BASE64_BYTES = 2_000_000;

// Cap how many submission ids the index entry holds so it stays well under
// the 25 MB KV value limit. At v1 the admin view shows the most recent 100.
const INDEX_MAX_ENTRIES = 500;

export interface ContactBody {
  name: string;
  email: string;
  message: string;
  /** Optional data: URL screenshot (image/jpeg). */
  screenshotDataUrl?: string;
}

export interface ContactSubmission extends ContactBody {
  id: string;
  /** Best-effort IP (Cloudflare's `cf-connecting-ip`, or 'unknown'). Stored
   *  so admin can spot repeated abuse from the same source. */
  ip: string;
  createdAt: number;
}

interface IndexEntry {
  id: string;
  createdAt: number;
}

export class ContactValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ContactValidationError';
    this.status = status;
  }
}

export class ContactRateLimitError extends Error {
  status = 429;
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('Too many contact submissions — please try again later.');
    this.name = 'ContactRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function validate(body: unknown): ContactBody {
  if (!body || typeof body !== 'object') {
    throw new ContactValidationError('Body must be JSON');
  }
  const b = body as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (name.length === 0 || name.length > 200) {
    throw new ContactValidationError('Name is required (max 200 chars).');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    throw new ContactValidationError('A valid email is required.');
  }
  if (message.length === 0 || message.length > 5000) {
    throw new ContactValidationError('Message is required (max 5000 chars).');
  }
  const screenshotDataUrl =
    typeof b.screenshotDataUrl === 'string' && b.screenshotDataUrl.startsWith('data:image/')
      ? b.screenshotDataUrl
      : undefined;
  if (screenshotDataUrl && screenshotDataUrl.length > MAX_SCREENSHOT_BASE64_BYTES) {
    throw new ContactValidationError('Screenshot exceeds 2 MB limit.');
  }
  return { name, email, message, screenshotDataUrl };
}

async function enforceRateLimit(kv: KVNamespace, ip: string): Promise<void> {
  const key = `${RATE_LIMIT_PREFIX}${ip}`;
  const raw = await kv.get(key);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  if (count >= RATE_LIMIT_MAX) {
    throw new ContactRateLimitError(RATE_LIMIT_WINDOW_SECONDS);
  }
  await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
}

function genSubmissionId(now: number): string {
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `cs_${now.toString(36)}_${rand}`;
}

async function readIndex(kv: KVNamespace): Promise<IndexEntry[]> {
  const raw = await kv.get(KEY_INDEX);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as IndexEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeIndex(kv: KVNamespace, entries: IndexEntry[]): Promise<void> {
  await kv.put(KEY_INDEX, JSON.stringify(entries.slice(0, INDEX_MAX_ENTRIES)));
}

interface ContactEnv {
  RATE_LIMIT: KVNamespace;
}

/**
 * Validate + rate-limit + persist to KV. Throws ContactValidationError /
 * ContactRateLimitError for the route to translate into HTTP.
 */
export async function submit(
  env: ContactEnv,
  ip: string,
  body: unknown,
  now: number = Date.now(),
): Promise<{ id: string }> {
  const validated = validate(body);
  await enforceRateLimit(env.RATE_LIMIT, ip);

  const id = genSubmissionId(now);
  const record: ContactSubmission = {
    id,
    ip,
    createdAt: now,
    ...validated,
  };
  await env.RATE_LIMIT.put(`${KEY_SUBMISSION_PREFIX}${id}`, JSON.stringify(record));

  const index = await readIndex(env.RATE_LIMIT);
  index.unshift({ id, createdAt: now });
  await writeIndex(env.RATE_LIMIT, index);

  return { id };
}

/**
 * List the most-recent contact submissions, newest-first. Used by the
 * admin dashboard.
 */
export async function listSubmissions(
  kv: KVNamespace,
  limit = 100,
): Promise<ContactSubmission[]> {
  const index = await readIndex(kv);
  const slice = index.slice(0, limit);
  const records = await Promise.all(
    slice.map(async (e) => {
      const raw = await kv.get(`${KEY_SUBMISSION_PREFIX}${e.id}`);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as ContactSubmission;
      } catch {
        return null;
      }
    }),
  );
  return records.filter((r): r is ContactSubmission => r !== null);
}
