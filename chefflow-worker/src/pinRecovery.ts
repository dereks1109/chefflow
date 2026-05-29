// PIN recovery via emailed 6-digit code.
//
// The Settings PIN is a client-side gate (Zustand persist, hashed
// PBKDF2-SHA256, lives only in the chef's localStorage). The worker
// never sees the PIN itself. This module exists only so the chef can
// prove access to their account email and then clear the local PIN
// from the Settings / PinGate UI; the worker's role is:
//
//   1. Resolve userId → primary email via Clerk Admin API.
//   2. Generate a 6-digit code, write it to KV with a 15-min TTL.
//   3. Email it to the chef via Resend (sendContactNotification).
//   4. On verify, compare the supplied code against KV and clear the
//      key on success (single-use).
//
// Rate-limit: max 3 sends per user per rolling hour. Prevents an
// adversary with a stolen Clerk session from spamming the chef's
// inbox.
//
// KV keys:
//   pinrecov:code:{userId}      → { code, expiresAt }   TTL ~15 min
//   pinrecov:throttle:{userId}  → integer count          TTL ~1 hour

import { sendContactNotification } from './contactMail';

const CODE_TTL_SECONDS = 15 * 60;
const THROTTLE_WINDOW_SECONDS = 60 * 60;
const MAX_SENDS_PER_WINDOW = 3;
const FROM_ADDRESS = 'ChefFlow Security <noreply@chefflow.uk>';

export interface PinRecoveryEnv {
  RATE_LIMIT: KVNamespace;
  CLERK_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestCodeResult {
  /** True when an email was dispatched (don't echo the code itself). */
  sent: boolean;
  /** Surface for tests / logs; never returned to untrusted callers. */
  skipReason?:
    | 'no-clerk-secret'
    | 'no-resend-key'
    | 'no-email-on-clerk'
    | 'rate-limited'
    | 'send-failed';
  /** Masked tail of the destination email, e.g. "…@chefflow.uk", for
   *  the SPA to show "code sent to …@chefflow.uk" without giving the
   *  full address back across the wire (defence-in-depth). */
  emailHint?: string;
}

export interface VerifyCodeResult {
  ok: boolean;
  /** Distinct failure modes so the SPA can show the right message
   *  without ever revealing which side of the code mismatch hit. */
  reason?: 'no-code' | 'expired' | 'wrong-code';
}

interface CodeBlob {
  code: string;
  expiresAt: number;
}

interface ClerkUser {
  id: string;
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string;
}

/** Six-digit, leading-zero preserved. Uses crypto.getRandomValues for
 *  unbiased uniform sampling vs. Math.random. */
function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const n = buf[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

async function fetchPrimaryEmail(
  userId: string,
  clerkSecret: string,
  fetchImpl: FetchLike,
): Promise<string | null> {
  const res = await fetchImpl(`https://api.clerk.com/v1/users/${userId}`, {
    headers: { Authorization: `Bearer ${clerkSecret}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as ClerkUser;
  const primaryId = user.primary_email_address_id;
  const primary = user.email_addresses?.find((e) => e.id === primaryId) ?? user.email_addresses?.[0];
  return primary?.email_address ?? null;
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'•'.repeat(Math.max(0, local.length - 2))}${domain}`;
}

async function bumpThrottle(kv: KVNamespace, userId: string): Promise<number> {
  const key = `pinrecov:throttle:${userId}`;
  const cur = await kv.get(key);
  const next = (cur ? parseInt(cur, 10) : 0) + 1;
  // Keep the same TTL window — the counter resets when KV expires the
  // key. (Cloudflare KV doesn't expose "get TTL"; resetting the TTL
  // on each bump would let an adversary block their own throttle from
  // expiring, but it'd also forgive a long-quiet user — fine for us.)
  await kv.put(key, String(next), { expirationTtl: THROTTLE_WINDOW_SECONDS });
  return next;
}

export async function requestPinRecoveryCode(
  env: PinRecoveryEnv,
  userId: string,
  fetchImpl: FetchLike = fetch,
): Promise<RequestCodeResult> {
  if (!env.CLERK_SECRET_KEY) {
    return { sent: false, skipReason: 'no-clerk-secret' };
  }
  if (!env.RESEND_API_KEY) {
    return { sent: false, skipReason: 'no-resend-key' };
  }

  // Rate-limit BEFORE fetching from Clerk or generating a code so
  // burning attempts doesn't even trigger upstream API calls.
  const count = await bumpThrottle(env.RATE_LIMIT, userId);
  if (count > MAX_SENDS_PER_WINDOW) {
    return { sent: false, skipReason: 'rate-limited' };
  }

  const email = await fetchPrimaryEmail(userId, env.CLERK_SECRET_KEY, fetchImpl);
  if (!email) {
    return { sent: false, skipReason: 'no-email-on-clerk' };
  }

  const code = generateCode();
  const expiresAt = Date.now() + CODE_TTL_SECONDS * 1000;
  await env.RATE_LIMIT.put(
    `pinrecov:code:${userId}`,
    JSON.stringify({ code, expiresAt } satisfies CodeBlob),
    { expirationTtl: CODE_TTL_SECONDS },
  );

  const htmlBody = `<!doctype html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937; max-width: 480px; margin: 0 auto; padding: 16px;">
  <h2 style="margin: 0 0 12px 0;">PIN recovery code</h2>
  <p>Use this code in ChefFlow to clear your edit-screen PIN:</p>
  <p style="margin: 16px 0; font-size: 28px; letter-spacing: 4px; font-weight: 700; text-align: center; padding: 12px; background: #f3f4f6; border-radius: 6px;">${code}</p>
  <p style="font-size: 13px; color: #6b7280;">
    Code expires in 15 minutes. Clearing your PIN does <strong>not</strong>
    touch your recipes, events, or notes — only the local lock screen.
  </p>
  <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
    Didn't request this? Someone may have access to your ChefFlow session.
    Ignore this email and change your account password.
  </p>
</body>
</html>`;
  const textBody = [
    `PIN recovery code: ${code}`,
    ``,
    `Code expires in 15 minutes. Clearing your PIN does NOT touch your`,
    `recipes, events, or notes — only the local lock screen.`,
    ``,
    `Didn't request this? Ignore this email and change your account password.`,
  ].join('\n');

  try {
    await sendContactNotification({
      apiKey: env.RESEND_API_KEY,
      name: 'PIN recovery',
      email: 'noreply@chefflow.uk',
      message: `PIN recovery code (see HTML body).`,
      toAddress: email,
      fromAddress: FROM_ADDRESS,
      htmlBodyOverride: htmlBody,
      textBodyOverride: textBody,
      subjectOverride: '[ChefFlow] PIN recovery code',
    });
  } catch (err) {
    console.warn('[pinRecovery] send failed:', err instanceof Error ? err.message : String(err));
    return { sent: false, skipReason: 'send-failed', emailHint: maskEmail(email) };
  }

  return { sent: true, emailHint: maskEmail(email) };
}

export async function verifyPinRecoveryCode(
  env: PinRecoveryEnv,
  userId: string,
  suppliedCode: string,
): Promise<VerifyCodeResult> {
  const normalised = suppliedCode.trim();
  if (!/^\d{6}$/.test(normalised)) {
    return { ok: false, reason: 'wrong-code' };
  }
  const key = `pinrecov:code:${userId}`;
  const raw = await env.RATE_LIMIT.get(key);
  if (!raw) return { ok: false, reason: 'no-code' };
  let blob: CodeBlob;
  try {
    blob = JSON.parse(raw) as CodeBlob;
  } catch {
    return { ok: false, reason: 'no-code' };
  }
  if (blob.expiresAt < Date.now()) {
    await env.RATE_LIMIT.delete(key);
    return { ok: false, reason: 'expired' };
  }
  if (blob.code !== normalised) {
    return { ok: false, reason: 'wrong-code' };
  }
  // Single-use: burn it.
  await env.RATE_LIMIT.delete(key);
  return { ok: true };
}
