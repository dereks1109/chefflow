// Daily digest of contact-form submissions, emailed to admin@chefflow.uk.
// Fired by the Cloudflare cron trigger declared in wrangler.toml. Reads
// the same KV store the public contact handler writes to (see
// `contact.ts:KEY_SUBMISSION_PREFIX`), filters to the last 24 hours,
// formats a markdown-ish HTML email, and ships via Resend (same client
// used for one-off contact notifications).
//
// Design choices:
//   - Skips the email entirely when zero submissions in the window.
//     No noise on quiet days.
//   - Capped at 50 submissions per digest. If we ever hit that volume
//     the chef has bigger problems than email length and should review
//     the admin dashboard directly.
//   - Failures (Resend down, KV unavailable) log a warn but don't throw
//     — the cron handler treats them as best-effort. Cloudflare will
//     fire again tomorrow.

import { listSubmissions, type ContactSubmission } from './contact';
import { sendContactNotification } from './contactMail';

const ADMIN_RECIPIENT = 'admin@chefflow.uk';
const DIGEST_FROM = 'ChefFlow Digest <noreply@chefflow.uk>';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PER_DIGEST = 50;

export interface DigestEnv {
  RATE_LIMIT: KVNamespace;
  RESEND_API_KEY?: string;
}

export interface DigestResult {
  /** Count of submissions in the 24h window. */
  windowed: number;
  /** True when we actually sent an email (zero-submission days skip). */
  sent: boolean;
  /** Surface for tests + log lines — undefined on success. */
  skipReason?: 'no-submissions' | 'no-api-key' | 'send-failed';
  /** When set, the email's Resend response status; useful for logs. */
  sentStatus?: number;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSubmissionHtml(s: ContactSubmission): string {
  const when = new Date(s.createdAt).toISOString();
  return [
    `<div style="margin-bottom: 16px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px;">`,
    `  <p style="margin: 0 0 4px 0;"><strong>${escapeHtml(s.name)}</strong> &lt;<a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a>&gt;</p>`,
    `  <p style="margin: 0 0 8px 0; font-size: 11px; color: #6b7280;">${when} · IP ${escapeHtml(s.ip)}</p>`,
    `  <pre style="white-space: pre-wrap; word-wrap: break-word; background: #f9fafb; padding: 8px; border-radius: 4px; font-family: inherit; margin: 0; font-size: 13px;">${escapeHtml(s.message)}</pre>`,
    `</div>`,
  ].join('\n');
}

function formatSubmissionText(s: ContactSubmission): string {
  const when = new Date(s.createdAt).toISOString();
  return [
    `From: ${s.name} <${s.email}>`,
    `Sent: ${when} (IP ${s.ip})`,
    ``,
    s.message,
    ``,
    `---`,
    ``,
  ].join('\n');
}

// Inner section HTML/text — h2 + per-submission entries, no doctype/body
// wrapper. The standalone contact-digest path wraps; combined daily-
// digest concatenates with the inbox section under one wrapper.
export function formatContactSectionHtml(windowed: ContactSubmission[], dayLabel: string): string {
  return `<h2 style="margin: 0 0 12px 0;">${windowed.length} new contact submission${windowed.length === 1 ? '' : 's'} (${dayLabel})</h2>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #6b7280;">Last 24h — admin@chefflow.uk daily digest.</p>
${windowed.map(formatSubmissionHtml).join('\n')}`;
}

export function formatContactSectionText(windowed: ContactSubmission[], dayLabel: string): string {
  return [
    `${windowed.length} new contact submission(s) (${dayLabel})`,
    `Last 24h — admin@chefflow.uk daily digest.`,
    ``,
    ...windowed.map(formatSubmissionText),
  ].join('\n');
}

export interface ContactDigestParts {
  sectionHtml: string;
  sectionText: string;
  count: number;
  /** Raw submission rows — exposed so alternate transports (Discord
   *  embeds, etc.) can render their own format without re-fetching KV. */
  submissions: ContactSubmission[];
}

export type ContactDigestPartsResult =
  | { ok: true; parts: ContactDigestParts; windowed: number }
  | { ok: false; windowed: 0; skipReason: 'no-submissions' };

/**
 * Read 24h of submissions and render the section HTML/text. Pure with
 * respect to email transport — the caller decides whether to wrap +
 * send standalone or stitch into the combined daily digest.
 */
export async function buildContactDigestParts(
  env: DigestEnv,
  now: number = Date.now(),
): Promise<ContactDigestPartsResult> {
  const recent = await listSubmissions(env.RATE_LIMIT, MAX_PER_DIGEST);
  const cutoff = now - WINDOW_MS;
  const windowed = recent.filter((s) => s.createdAt >= cutoff);

  if (windowed.length === 0) {
    return { ok: false, windowed: 0, skipReason: 'no-submissions' };
  }

  const dayLabel = new Date(now).toISOString().slice(0, 10);
  return {
    ok: true,
    windowed: windowed.length,
    parts: {
      sectionHtml: formatContactSectionHtml(windowed, dayLabel),
      sectionText: formatContactSectionText(windowed, dayLabel),
      count: windowed.length,
      submissions: windowed,
    },
  };
}

/** Build + send the standalone contact digest. Idempotent on KV (read-only). */
export async function runContactDigest(
  env: DigestEnv,
  now: number = Date.now(),
): Promise<DigestResult> {
  const result = await buildContactDigestParts(env, now);
  if (!result.ok) {
    return { windowed: 0, sent: false, skipReason: result.skipReason };
  }

  if (!env.RESEND_API_KEY) {
    // Without an API key we can't email — log + skip rather than crash.
    // (Should never happen in prod: same key powers the real-time
    // contact notification, which would already be broken.)
    console.warn('[contactDigest] RESEND_API_KEY missing; skipping send');
    return { windowed: result.windowed, sent: false, skipReason: 'no-api-key' };
  }

  const { parts, windowed } = result;
  const dayLabel = new Date(now).toISOString().slice(0, 10);
  try {
    await sendContactNotification({
      apiKey: env.RESEND_API_KEY,
      // The helper builds its own subject from `name`. We piggy-back by
      // setting `name` to the digest label and `message` to a marker;
      // the chef-displayed payload comes from our html/text bodies via
      // the override pathway below.
      name: `${windowed} new submission${windowed === 1 ? '' : 's'}`,
      email: 'noreply@chefflow.uk',
      message: `Daily digest — see HTML body for ${windowed} entries.`,
      toAddress: ADMIN_RECIPIENT,
      fromAddress: DIGEST_FROM,
      // Override the helper's html/text with the digest payload.
      htmlBodyOverride: `<!doctype html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937;">
${parts.sectionHtml}
</body>
</html>`,
      textBodyOverride: parts.sectionText,
      subjectOverride: `[ChefFlow] ${windowed} contact submission${windowed === 1 ? '' : 's'} — ${dayLabel}`,
    });
    return { windowed, sent: true };
  } catch (err) {
    console.warn('[contactDigest] send failed:', err instanceof Error ? err.message : String(err));
    return { windowed, sent: false, skipReason: 'send-failed' };
  }
}
