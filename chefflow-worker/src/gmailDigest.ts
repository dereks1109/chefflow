// Daily Gmail inbox summary, emailed to admin@chefflow.uk via Resend.
// Fires from the Cloudflare cron trigger declared in wrangler.toml.
//
// Flow:
//   1. Refresh-token → access-token (Google OAuth).
//   2. Gmail search for "newer_than:1d in:inbox -in:chats -in:trash" →
//      max 50 message ids.
//   3. Fetch headers + snippet for each (metadata format, not full body —
//      Gmail-API quota friendly).
//   4. LLM-summarise into a priority-grouped digest (urgency × importance).
//   5. Email the digest to admin@chefflow.uk.
//
// LLM uses Workers AI (env.AI) via the existing `runAi` helper. Prompt
// is small and constrained — outputs JSON, parsed and rendered into
// HTML. Failure modes (token refresh fails, Gmail down, LLM glitch)
// log a warn but never throw — Cloudflare reruns tomorrow.

import { runAi } from './aiCall';
import {
  getAccessToken,
  getMessage,
  listMessageIds,
  type GmailMessageSummary,
} from './gmail';
import { sendContactNotification } from './contactMail';

const ADMIN_RECIPIENT = 'admin@chefflow.uk';
const DIGEST_FROM = 'ChefFlow Inbox Digest <noreply@chefflow.uk>';
const GMAIL_QUERY = 'newer_than:1d in:inbox -in:chats -in:trash';
const MAX_MESSAGES = 50;
const SUMMARY_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export interface GmailDigestEnv {
  AI: Ai;
  RESEND_API_KEY?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REFRESH_TOKEN?: string;
}

export interface GmailDigestResult {
  fetched: number;
  sent: boolean;
  skipReason?:
    | 'no-secrets'
    | 'no-api-key'
    | 'no-messages'
    | 'gmail-failed'
    | 'llm-failed'
    | 'send-failed';
}

interface DigestItem {
  priority: 1 | 2 | 3 | 4 | 5;   // 1 = urgent + important
  oneLine: string;                // a single-sentence summary
  from?: string;
  subject?: string;
}

interface DigestPayload {
  items: DigestItem[];
}

const SYSTEM_PROMPT = `You are an inbox triage assistant. Given a list of email metadata + snippets from the past 24 hours, group them by priority and produce a single JSON object.

Output schema:
{
  "items": [
    { "priority": 1 | 2 | 3 | 4 | 5,
      "oneLine": "string",
      "from": "string (optional)",
      "subject": "string (optional)" }
  ]
}

Priority rules:
1 = urgent AND important (act today: paying customer, system alert, time-sensitive request)
2 = important, not urgent (high-value but no deadline pressure)
3 = routine work mail
4 = low value (newsletters with relevant signal, vendor checkins)
5 = noise (marketing blasts, automated digests, social notifications)

Per-item rules:
- ONE sentence per item, present-tense, action-oriented when possible ("Sam confirms event for Saturday at 7 pm" not "Sam sent an email about an event").
- Include the original from + subject when available.
- Skip nothing — every input message must appear as an item.
- Sort items priority ascending (1 first, 5 last).

Return ONLY the JSON object. No prose, no fences.`;

function buildUserPrompt(messages: GmailMessageSummary[]): string {
  const lines = messages.map((m, i) => {
    const parts = [`MESSAGE ${i + 1}`];
    if (m.from) parts.push(`From: ${m.from}`);
    if (m.subject) parts.push(`Subject: ${m.subject}`);
    if (m.date) parts.push(`Date: ${m.date}`);
    if (m.snippet) parts.push(`Snippet: ${m.snippet}`);
    return parts.join('\n');
  });
  return `Summarise these ${messages.length} emails into a priority-grouped digest.\n\n${lines.join('\n\n---\n\n')}`;
}

function parseDigestJson(raw: string): DigestPayload {
  // Workers AI returns JSON-mode content as a string in `result.response`.
  // Strip stray markdown fences just in case.
  const stripped = raw.replace(/^```(?:json)?\n?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(stripped) as unknown;
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { items?: unknown }).items)) {
    throw new Error('LLM did not return {items: [...]}');
  }
  const items: DigestItem[] = [];
  for (const it of (parsed as { items: unknown[] }).items) {
    if (typeof it !== 'object' || it === null) continue;
    const r = it as Record<string, unknown>;
    const p = typeof r.priority === 'number' ? Math.min(5, Math.max(1, Math.round(r.priority))) : 3;
    const oneLine = typeof r.oneLine === 'string' ? r.oneLine : '';
    if (!oneLine) continue;
    items.push({
      priority: p as DigestItem['priority'],
      oneLine,
      from: typeof r.from === 'string' ? r.from : undefined,
      subject: typeof r.subject === 'string' ? r.subject : undefined,
    });
  }
  return { items };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inner HTML for the inbox section — h2 + priority groups, no doctype/
// body wrapper. The standalone gmail-digest path wraps this in <html>
// before sending; the combined daily-digest concatenates it with the
// contact section under one wrapper.
export function formatDigestSectionHtml(payload: DigestPayload, dayLabel: string): string {
  const groups = new Map<number, DigestItem[]>();
  for (const item of payload.items) {
    const arr = groups.get(item.priority) ?? [];
    arr.push(item);
    groups.set(item.priority, arr);
  }
  const labels: Record<number, { name: string; color: string }> = {
    1: { name: 'Urgent + important — act today', color: '#b91c1c' },
    2: { name: 'Important, not urgent', color: '#c2410c' },
    3: { name: 'Routine', color: '#374151' },
    4: { name: 'Low value', color: '#6b7280' },
    5: { name: 'Noise', color: '#9ca3af' },
  };
  const sections: string[] = [];
  for (const p of [1, 2, 3, 4, 5]) {
    const items = groups.get(p);
    if (!items || items.length === 0) continue;
    const itemsHtml = items.map((it) => {
      const meta = it.from || it.subject
        ? `<p style="margin: 0 0 0 16px; font-size: 11px; color: #6b7280;">${escapeHtml(it.from ?? '')}${it.from && it.subject ? ' — ' : ''}${escapeHtml(it.subject ?? '')}</p>`
        : '';
      return `<li style="margin-bottom: 8px;">${escapeHtml(it.oneLine)}${meta}</li>`;
    }).join('\n');
    sections.push(`
      <h3 style="margin: 16px 0 6px 0; font-size: 13px; color: ${labels[p].color}; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
        P${p} — ${labels[p].name} (${items.length})
      </h3>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
        ${itemsHtml}
      </ul>
    `);
  }
  return `<h2 style="margin: 0 0 12px 0;">Inbox digest — ${dayLabel}</h2>
<p style="margin: 0 0 16px 0; font-size: 13px; color: #6b7280;">
  ${payload.items.length} email${payload.items.length === 1 ? '' : 's'} from the last 24 hours, ranked.
</p>
${sections.join('\n')}`;
}

export function formatDigestSectionText(payload: DigestPayload, dayLabel: string): string {
  const sorted = [...payload.items].sort((a, b) => a.priority - b.priority);
  const lines = [
    `Inbox digest — ${dayLabel}`,
    `${payload.items.length} emails ranked by urgency × importance.`,
    ``,
  ];
  for (const it of sorted) {
    lines.push(`[P${it.priority}] ${it.oneLine}`);
    if (it.from || it.subject) {
      lines.push(`    ${[it.from, it.subject].filter(Boolean).join(' — ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export interface GmailDigestParts {
  sectionHtml: string;
  sectionText: string;
  itemCount: number;
}

export type GmailDigestPartsResult =
  | { ok: true; parts: GmailDigestParts; fetched: number }
  | {
      ok: false;
      fetched: number;
      skipReason: 'no-secrets' | 'no-messages' | 'gmail-failed' | 'llm-failed';
    };

/**
 * Run the OAuth → Gmail → LLM pipeline and return rendered section HTML/
 * text. Pure with respect to email transport: the caller decides whether
 * to wrap + send (standalone gmail-digest) or stitch with another digest
 * (combined daily-digest).
 */
export async function buildGmailDigestParts(
  env: GmailDigestEnv,
  now: number = Date.now(),
): Promise<GmailDigestPartsResult> {
  const { GOOGLE_OAUTH_CLIENT_ID: id, GOOGLE_OAUTH_CLIENT_SECRET: secret, GOOGLE_OAUTH_REFRESH_TOKEN: refresh } = env;
  if (!id || !secret || !refresh) {
    console.warn('[gmailDigest] OAuth secrets missing; skipping');
    return { ok: false, fetched: 0, skipReason: 'no-secrets' };
  }

  let access: string;
  let summaries: GmailMessageSummary[];
  try {
    access = await getAccessToken({ clientId: id, clientSecret: secret, refreshToken: refresh });
    const ids = await listMessageIds(access, GMAIL_QUERY, MAX_MESSAGES);
    if (ids.length === 0) {
      return { ok: false, fetched: 0, skipReason: 'no-messages' };
    }
    summaries = await Promise.all(ids.map((m) => getMessage(access, m.id)));
  } catch (err) {
    console.warn('[gmailDigest] Gmail step failed:', err instanceof Error ? err.message : String(err));
    return { ok: false, fetched: 0, skipReason: 'gmail-failed' };
  }

  let digest: DigestPayload;
  try {
    const raw = await runAi(env.AI, SUMMARY_MODEL, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(summaries),
    });
    digest = parseDigestJson(raw);
  } catch (err) {
    console.warn('[gmailDigest] LLM step failed:', err instanceof Error ? err.message : String(err));
    return { ok: false, fetched: summaries.length, skipReason: 'llm-failed' };
  }

  const dayLabel = new Date(now).toISOString().slice(0, 10);
  return {
    ok: true,
    fetched: summaries.length,
    parts: {
      sectionHtml: formatDigestSectionHtml(digest, dayLabel),
      sectionText: formatDigestSectionText(digest, dayLabel),
      itemCount: digest.items.length,
    },
  };
}

/** Build + send the standalone Gmail digest. Best-effort across every failure mode. */
export async function runGmailDigest(
  env: GmailDigestEnv,
  now: number = Date.now(),
): Promise<GmailDigestResult> {
  if (!env.RESEND_API_KEY) {
    console.warn('[gmailDigest] RESEND_API_KEY missing; skipping');
    return { fetched: 0, sent: false, skipReason: 'no-api-key' };
  }
  const result = await buildGmailDigestParts(env, now);
  if (!result.ok) {
    return { fetched: result.fetched, sent: false, skipReason: result.skipReason };
  }

  const { parts, fetched } = result;
  const dayLabel = new Date(now).toISOString().slice(0, 10);
  try {
    await sendContactNotification({
      apiKey: env.RESEND_API_KEY,
      name: 'Inbox digest',
      email: 'noreply@chefflow.uk',
      message: `Daily Gmail digest — see HTML body for ${parts.itemCount} items.`,
      toAddress: ADMIN_RECIPIENT,
      fromAddress: DIGEST_FROM,
      htmlBodyOverride: `<!doctype html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937;">
${parts.sectionHtml}
</body>
</html>`,
      textBodyOverride: parts.sectionText,
      subjectOverride: `[ChefFlow Inbox] ${parts.itemCount} email${parts.itemCount === 1 ? '' : 's'} — ${dayLabel}`,
    });
    return { fetched, sent: true };
  } catch (err) {
    console.warn('[gmailDigest] send failed:', err instanceof Error ? err.message : String(err));
    return { fetched, sent: false, skipReason: 'send-failed' };
  }
}
