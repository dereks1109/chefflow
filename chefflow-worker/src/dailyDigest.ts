// Combined daily ops digest — fired by the single 08:00 UTC cron in
// wrangler.toml. Concatenates the LLM-summarised Gmail inbox and the
// contact-form submissions into ONE email so admin@chefflow.uk gets a
// single ops check-in each morning instead of two staggered ones.
//
// Behaviour:
//   - Both sections render in parallel. Either side can fail without
//     blocking the other (Gmail OAuth glitch shouldn't suppress contact
//     submissions; empty submissions shouldn't suppress the inbox).
//   - The combined email always includes both sections. When a section
//     has no content (empty inbox, no submissions, or upstream failure)
//     a one-line placeholder appears in its slot so the chef can tell
//     the cron ran AND why that side is empty.
//   - Skips sending entirely only when BOTH sections are empty AND
//     neither side errored — i.e. a genuinely quiet day. Failure modes
//     always send the email (so the chef notices and can investigate
//     via wrangler tail).
//
// This module owns the email transport for the daily digest. The
// individual `runGmailDigest` / `runContactDigest` still exist for ad-
// hoc testing via /admin/cron/run, but the scheduled cron only invokes
// this combined path.

import {
  buildContactDigestParts,
  type DigestEnv as ContactDigestEnv,
} from './contactDigest';
import { sendContactNotification } from './contactMail';
import {
  buildGmailDigestParts,
  type GmailDigestEnv,
} from './gmailDigest';

const ADMIN_RECIPIENT = 'admin@chefflow.uk';
const DIGEST_FROM = 'ChefFlow Daily Digest <noreply@chefflow.uk>';

export type DailyDigestEnv = GmailDigestEnv & ContactDigestEnv;

export interface DailyDigestResult {
  /** Gmail-side outcome label — mirrors buildGmailDigestParts skipReason or 'ok'. */
  gmail: 'ok' | 'no-secrets' | 'no-messages' | 'gmail-failed' | 'llm-failed';
  /** Contact-side outcome label. */
  contact: 'ok' | 'no-submissions';
  /** Total inbox items rendered (0 when gmail side empty / failed). */
  gmailItems: number;
  /** Total contact submissions rendered (0 when contact side empty). */
  contactCount: number;
  /** True when the combined email was sent. */
  sent: boolean;
  /** Reason the email was NOT sent — undefined on success. */
  skipReason?: 'quiet-day' | 'no-api-key' | 'send-failed';
}

function gmailPlaceholderHtml(status: 'no-secrets' | 'no-messages' | 'gmail-failed' | 'llm-failed', dayLabel: string): string {
  const messages: Record<typeof status, string> = {
    'no-secrets': 'Gmail OAuth secrets not configured — inbox digest unavailable.',
    'no-messages': 'No new inbox emails in the last 24 hours.',
    'gmail-failed': 'Inbox digest unavailable — Gmail API call failed (check worker logs).',
    'llm-failed': 'Inbox digest unavailable — summariser failed (check worker logs).',
  };
  return `<h2 style="margin: 0 0 12px 0;">Inbox digest — ${dayLabel}</h2>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #6b7280;">${messages[status]}</p>`;
}

function gmailPlaceholderText(status: 'no-secrets' | 'no-messages' | 'gmail-failed' | 'llm-failed', dayLabel: string): string {
  const messages: Record<typeof status, string> = {
    'no-secrets': 'Gmail OAuth secrets not configured — inbox digest unavailable.',
    'no-messages': 'No new inbox emails in the last 24 hours.',
    'gmail-failed': 'Inbox digest unavailable — Gmail API call failed (check worker logs).',
    'llm-failed': 'Inbox digest unavailable — summariser failed (check worker logs).',
  };
  return `Inbox digest — ${dayLabel}\n${messages[status]}\n`;
}

function contactPlaceholderHtml(dayLabel: string): string {
  return `<h2 style="margin: 0 0 12px 0;">Contact submissions — ${dayLabel}</h2>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #6b7280;">No new contact form submissions in the last 24 hours.</p>`;
}

function contactPlaceholderText(dayLabel: string): string {
  return `Contact submissions — ${dayLabel}\nNo new contact form submissions in the last 24 hours.\n`;
}

export async function runDailyDigest(
  env: DailyDigestEnv,
  now: number = Date.now(),
): Promise<DailyDigestResult> {
  const dayLabel = new Date(now).toISOString().slice(0, 10);

  // Render both sides in parallel. Settled, not all — one side failing
  // shouldn't abort the other.
  const [gmailRes, contactRes] = await Promise.all([
    buildGmailDigestParts(env, now).catch((err) => {
      console.warn('[dailyDigest] gmail build threw:', err instanceof Error ? err.message : String(err));
      return { ok: false as const, fetched: 0, skipReason: 'gmail-failed' as const };
    }),
    buildContactDigestParts(env, now).catch((err) => {
      console.warn('[dailyDigest] contact build threw:', err instanceof Error ? err.message : String(err));
      // listSubmissions can't really throw against KV, but be defensive.
      return { ok: false as const, windowed: 0 as const, skipReason: 'no-submissions' as const };
    }),
  ]);

  const gmailStatus = gmailRes.ok ? 'ok' : gmailRes.skipReason;
  const contactStatus = contactRes.ok ? 'ok' : contactRes.skipReason;
  const gmailItems = gmailRes.ok ? gmailRes.parts.itemCount : 0;
  const contactCount = contactRes.ok ? contactRes.parts.count : 0;

  // Genuinely quiet day: skip send so the chef doesn't get noise. ANY
  // failure mode still sends so the chef sees the placeholder + can
  // investigate via wrangler tail.
  const quietDay = gmailStatus === 'no-messages' && contactStatus === 'no-submissions';
  if (quietDay) {
    return {
      gmail: gmailStatus,
      contact: contactStatus,
      gmailItems: 0,
      contactCount: 0,
      sent: false,
      skipReason: 'quiet-day',
    };
  }

  if (!env.RESEND_API_KEY) {
    console.warn('[dailyDigest] RESEND_API_KEY missing; skipping send');
    return {
      gmail: gmailStatus,
      contact: contactStatus,
      gmailItems,
      contactCount,
      sent: false,
      skipReason: 'no-api-key',
    };
  }

  const gmailHtml = gmailRes.ok
    ? gmailRes.parts.sectionHtml
    : gmailPlaceholderHtml(gmailRes.skipReason, dayLabel);
  const gmailText = gmailRes.ok
    ? gmailRes.parts.sectionText
    : gmailPlaceholderText(gmailRes.skipReason, dayLabel);
  const contactHtml = contactRes.ok
    ? contactRes.parts.sectionHtml
    : contactPlaceholderHtml(dayLabel);
  const contactText = contactRes.ok
    ? contactRes.parts.sectionText
    : contactPlaceholderText(dayLabel);

  const combinedHtml = `<!doctype html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937; max-width: 720px; margin: 0 auto; padding: 16px;">
  <h1 style="margin: 0 0 6px 0; font-size: 18px;">ChefFlow daily ops digest — ${dayLabel}</h1>
  <p style="margin: 0 0 24px 0; font-size: 12px; color: #6b7280;">Inbox triage + contact submissions for the last 24 hours.</p>

  <section style="margin-bottom: 32px;">
${gmailHtml}
  </section>

  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">

  <section>
${contactHtml}
  </section>
</body>
</html>`;

  const combinedText = [
    `ChefFlow daily ops digest — ${dayLabel}`,
    `Inbox triage + contact submissions for the last 24 hours.`,
    ``,
    `=== Inbox ===`,
    ``,
    gmailText,
    ``,
    `=== Contact submissions ===`,
    ``,
    contactText,
  ].join('\n');

  // Subject summarises both halves so the chef can decide priority
  // from the notification preview alone.
  const subject = buildSubject(gmailStatus, gmailItems, contactStatus, contactCount, dayLabel);

  try {
    await sendContactNotification({
      apiKey: env.RESEND_API_KEY,
      name: 'Daily ops digest',
      email: 'noreply@chefflow.uk',
      message: `Daily ops digest — see HTML body.`,
      toAddress: ADMIN_RECIPIENT,
      fromAddress: DIGEST_FROM,
      htmlBodyOverride: combinedHtml,
      textBodyOverride: combinedText,
      subjectOverride: subject,
    });
    return {
      gmail: gmailStatus,
      contact: contactStatus,
      gmailItems,
      contactCount,
      sent: true,
    };
  } catch (err) {
    console.warn('[dailyDigest] send failed:', err instanceof Error ? err.message : String(err));
    return {
      gmail: gmailStatus,
      contact: contactStatus,
      gmailItems,
      contactCount,
      sent: false,
      skipReason: 'send-failed',
    };
  }
}

function buildSubject(
  gmailStatus: DailyDigestResult['gmail'],
  gmailItems: number,
  contactStatus: DailyDigestResult['contact'],
  contactCount: number,
  dayLabel: string,
): string {
  const parts: string[] = [];
  if (gmailStatus === 'ok') {
    parts.push(`${gmailItems} email${gmailItems === 1 ? '' : 's'}`);
  } else if (gmailStatus !== 'no-messages') {
    parts.push('inbox unavailable');
  }
  if (contactStatus === 'ok') {
    parts.push(`${contactCount} submission${contactCount === 1 ? '' : 's'}`);
  }
  const summary = parts.length > 0 ? parts.join(' + ') : 'quiet day';
  return `[ChefFlow] Daily digest — ${summary} (${dayLabel})`;
}
