// Sends transactional email to team members when a recipe or event
// becomes newly shared with their group. Wired from sync.ts via the
// ShareNotificationContext callback the route handler hands to
// ctx.waitUntil() so a slow/failed Resend call doesn't block the push
// response.
//
// Sender domain matches the existing transactional sender from
// contactMail.ts — noreply@chefflow.uk is already DKIM/SPF verified on
// Resend. Replies are pointed back at noreply@ because a chef hitting
// reply on an automated share notification shouldn't ping the admin
// inbox.

import type { ShareNotificationContext } from './sync';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'ChefFlow Teams <noreply@chefflow.uk>';
const DEFAULT_APP_BASE_URL = 'https://chefflow.uk';

interface TeamMembershipRow {
  member_email: string;
  member_user_id: string | null;
}

export interface NotifyTeamOnShareInput {
  db: D1Database;
  ctx: ShareNotificationContext;
  /** Resend API key — defaults to env.RESEND_API_KEY. When missing,
   *  the call early-returns (no-op, logged). */
  apiKey: string | undefined;
  /** Override the public app URL used in deep links. Defaults to
   *  https://chefflow.uk to match the rest of the worker. */
  appBaseUrl?: string;
  /** Optional injected fetch — used by tests to mock Resend. */
  fetchImpl?: typeof fetch;
  /** Inviter display name shown in the email subject + body. When
   *  unresolved the email falls back to "A teammate". */
  ownerDisplayName?: string | null;
}

/** Wraps a recipe/event payload's title for use in the email. Defensive:
 *  if the payload doesn't parse or has no title, returns null and the
 *  caller falls back to the generic copy. */
function readTitle(payloadStr: string): string | null {
  try {
    const parsed = JSON.parse(payloadStr) as { title?: unknown };
    if (typeof parsed?.title === 'string' && parsed.title.trim()) {
      return parsed.title.trim();
    }
  } catch {
    // fall through
  }
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Orchestrates a single share notification: looks up every accepted
 *  member of each newly-added group, deduplicates (a member in multiple
 *  groups gets at most one email per share), and fires Resend per
 *  recipient. Errors are caught and logged — a failed send must not
 *  poison the surrounding sync.push() call. */
export async function notifyTeamOnShare(input: NotifyTeamOnShareInput): Promise<void> {
  const { db, ctx, apiKey, appBaseUrl = DEFAULT_APP_BASE_URL, fetchImpl, ownerDisplayName } = input;

  if (!apiKey) {
    console.warn('[shareMail] RESEND_API_KEY missing — skipping share notification');
    return;
  }

  // Look up accepted members of every newly-added group. Dedupe across
  // groups by member_email so a chef in two groups doesn't get two
  // emails for the same share.
  const recipients = new Map<string, TeamMembershipRow>();
  for (const groupId of ctx.addedGroupIds) {
    try {
      const result = await db
        .prepare(
          `SELECT member_email, member_user_id
           FROM team_memberships
           WHERE group_id = ? AND accepted_at IS NOT NULL`,
        )
        .bind(groupId)
        .all<TeamMembershipRow>();
      for (const row of result.results ?? []) {
        // Skip the owner who initiated the share — they already know.
        if (row.member_user_id === ctx.ownerUserId) continue;
        if (!row.member_email) continue;
        recipients.set(row.member_email.toLowerCase(), row);
      }
    } catch (err) {
      console.warn(
        '[shareMail] team_memberships lookup failed for group',
        groupId,
        ':',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (recipients.size === 0) return;

  const itemTitle = readTitle(ctx.newPayload);
  const itemLabel = ctx.table === 'recipes' ? 'recipe' : 'event';
  const itemPath = ctx.table === 'recipes' ? 'recipes' : 'events';
  const deepLink = `${appBaseUrl}/${itemPath}/${ctx.rowId}`;
  const inviter = ownerDisplayName?.trim() || 'A teammate';

  for (const [email, _row] of recipients) {
    try {
      await sendShareNotification({
        apiKey,
        toAddress: email,
        inviterName: inviter,
        itemLabel,
        itemTitle,
        deepLink,
        fetchImpl,
      });
    } catch (err) {
      console.warn(
        '[shareMail] send failed for',
        email,
        ':',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

interface SendShareNotificationInput {
  apiKey: string;
  toAddress: string;
  inviterName: string;
  itemLabel: 'recipe' | 'event';
  itemTitle: string | null;
  deepLink: string;
  fetchImpl?: typeof fetch;
}

export async function sendShareNotification(input: SendShareNotificationInput): Promise<void> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const titleClause = input.itemTitle ? ` "${input.itemTitle}"` : '';
  const subject = `${input.inviterName} shared a ${input.itemLabel} with your team`;

  const textBody = [
    `${input.inviterName} shared a ${input.itemLabel}${titleClause} with your ChefFlow team.`,
    ``,
    `Open it here:`,
    input.deepLink,
    ``,
    `— ChefFlow`,
  ].join('\n');

  const safeInviter = escapeHtml(input.inviterName);
  const safeTitle = input.itemTitle ? escapeHtml(input.itemTitle) : '';
  const titleHtml = safeTitle ? ` <strong>${safeTitle}</strong>` : '';
  const htmlBody = `<!doctype html>
<html><body style="font-family:-apple-system,system-ui,sans-serif;color:#1f2937;">
<h2 style="margin:0 0 12px 0;">${safeInviter} shared a ${input.itemLabel} with your team</h2>
<p>${safeInviter} just shared a ${input.itemLabel}${titleHtml} with your ChefFlow team.</p>
<p><a href="${input.deepLink}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#f97316;color:#fff;text-decoration:none;font-weight:600;">Open ${input.itemLabel}</a></p>
<p style="font-size:12px;color:#6b7280;">If the button doesn't work, paste this URL into your browser:<br>${input.deepLink}</p>
</body></html>`;

  const res = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: DEFAULT_FROM,
      to: [input.toAddress],
      subject,
      text: textBody,
      html: htmlBody,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`Resend send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}
