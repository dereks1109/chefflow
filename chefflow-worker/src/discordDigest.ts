// Post a tightened version of the daily digest to a Discord channel
// via webhook. Mirror of the Resend transport in spirit, but fires
// conditionally — the daily orchestrator only calls us when the Gmail
// digest contains at least one P1 (urgent + important) or P2
// (important, not urgent) item. The chef chose this cadence to keep
// Discord quiet on uneventful days.
//
// Discord webhook docs:
//   POST <url>  body = { username?, content?, embeds?[] }
//   Webhook URL is bearer-credential equivalent — stored as a worker
//   secret (DISCORD_DIGEST_WEBHOOK_URL), never in source.
//
// Embed limits we respect (Discord caps):
//   - ≤ 10 embeds per message (we use up to 2: inbox + contact)
//   - ≤ 25 fields per embed (we cap urgent-items list at 20)
//   - field.name ≤ 256 chars
//   - field.value ≤ 1024 chars
//   - total embed character budget 6000 — well under with our caps

import type { GmailDigestItem } from './gmailDigest';
import type { ContactSubmission } from './contact';

export interface DiscordDigestEnv {
  DISCORD_DIGEST_WEBHOOK_URL?: string;
}

export interface DiscordDigestInput {
  /** Day label shown in embed footers ("2026-05-29"). */
  dayLabel: string;
  /** P1 + P2 items from the Gmail digest. Required to trigger send. */
  urgentItems: GmailDigestItem[];
  /** Total inbox count (across all priorities) for context. */
  inboxItemCount: number;
  /** Contact-form submissions today; optional — only embedded when present. */
  contactSubmissions?: ContactSubmission[];
}

export interface DiscordDigestResult {
  sent: boolean;
  skipReason?: 'no-webhook' | 'no-urgent' | 'send-failed';
  /** HTTP status when we actually POSTed. */
  status?: number;
}

const FIELD_NAME_MAX = 256;
const FIELD_VALUE_MAX = 1024;
const MAX_URGENT_FIELDS = 20;
const MAX_CONTACT_FIELDS = 10;
// Discord embed colors are 24-bit ints (0xRRGGBB).
const COLOR_URGENT = 0xb91c1c;   // red-700 — matches the P1 swatch in the email
const COLOR_CONTACT = 0xc2410c;  // orange-700 — matches contact-section accent

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: DiscordField[];
  footer?: { text: string };
}

function buildInboxEmbed(urgentItems: GmailDigestItem[], inboxItemCount: number, dayLabel: string): DiscordEmbed {
  // Sort P1 first, then P2 — same ordering as the email's priority groups.
  const sorted = [...urgentItems].sort((a, b) => a.priority - b.priority);
  const capped = sorted.slice(0, MAX_URGENT_FIELDS);
  const fields: DiscordField[] = capped.map((it) => ({
    name: truncate(`[P${it.priority}] ${it.oneLine}`, FIELD_NAME_MAX),
    value: truncate(
      [it.from, it.subject].filter(Boolean).join(' — ') || '(no headers)',
      FIELD_VALUE_MAX,
    ),
  }));
  if (sorted.length > MAX_URGENT_FIELDS) {
    fields.push({
      name: `…and ${sorted.length - MAX_URGENT_FIELDS} more`,
      value: 'See the full email digest in admin@chefflow.uk.',
    });
  }
  return {
    title: `🔔 ${urgentItems.length} urgent inbox item${urgentItems.length === 1 ? '' : 's'}`,
    description: `${inboxItemCount} total email${inboxItemCount === 1 ? '' : 's'} ranked — only P1 + P2 shown.`,
    color: COLOR_URGENT,
    fields,
    footer: { text: `ChefFlow daily digest · ${dayLabel}` },
  };
}

function buildContactEmbed(submissions: ContactSubmission[], dayLabel: string): DiscordEmbed {
  const capped = submissions.slice(0, MAX_CONTACT_FIELDS);
  const fields: DiscordField[] = capped.map((s) => ({
    name: truncate(`${s.name} <${s.email}>`, FIELD_NAME_MAX),
    value: truncate(
      `${new Date(s.createdAt).toISOString()}\n${s.message}`,
      FIELD_VALUE_MAX,
    ),
  }));
  if (submissions.length > MAX_CONTACT_FIELDS) {
    fields.push({
      name: `…and ${submissions.length - MAX_CONTACT_FIELDS} more`,
      value: 'See the full email digest in admin@chefflow.uk.',
    });
  }
  return {
    title: `📨 ${submissions.length} contact submission${submissions.length === 1 ? '' : 's'}`,
    color: COLOR_CONTACT,
    fields,
    footer: { text: `ChefFlow daily digest · ${dayLabel}` },
  };
}

/**
 * Build the embed payload + POST to the configured Discord webhook.
 *
 * Returns:
 *   - sent=false / no-webhook → secret not configured; caller logs + skips.
 *   - sent=false / no-urgent  → defensive no-op (caller should also check this).
 *   - sent=false / send-failed→ POST failed; status is the HTTP code if available.
 *   - sent=true               → 2xx response from Discord.
 */
export async function sendDiscordDigest(
  env: DiscordDigestEnv,
  input: DiscordDigestInput,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscordDigestResult> {
  if (!env.DISCORD_DIGEST_WEBHOOK_URL) {
    return { sent: false, skipReason: 'no-webhook' };
  }
  if (input.urgentItems.length === 0) {
    return { sent: false, skipReason: 'no-urgent' };
  }

  const embeds: DiscordEmbed[] = [buildInboxEmbed(input.urgentItems, input.inboxItemCount, input.dayLabel)];
  if (input.contactSubmissions && input.contactSubmissions.length > 0) {
    embeds.push(buildContactEmbed(input.contactSubmissions, input.dayLabel));
  }

  const body = JSON.stringify({
    username: 'ChefFlow Daily Digest',
    embeds,
  });

  try {
    const res = await fetchImpl(env.DISCORD_DIGEST_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) {
      console.warn('[discordDigest] webhook POST returned', res.status);
      return { sent: false, skipReason: 'send-failed', status: res.status };
    }
    return { sent: true, status: res.status };
  } catch (err) {
    console.warn('[discordDigest] webhook POST threw:', err instanceof Error ? err.message : String(err));
    return { sent: false, skipReason: 'send-failed' };
  }
}
