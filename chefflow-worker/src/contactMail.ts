// Sends a notification email when the public contact form is submitted.
//
// Uses Resend (https://api.resend.com/emails) — free up to 100 emails/day,
// more than we need. MailChannels was the original plan but became
// paid-only in 2024, and Cloudflare's native Email Sending is gated
// behind a dashboard opt-in we couldn't trigger from CLI. Resend is the
// cleanest "ship today" option.
//
// REQUIRES the worker secret `RESEND_API_KEY` set via:
//   cd chefflow-worker && npx wrangler secret put RESEND_API_KEY
//
// DEFAULT `from` is `onboarding@resend.dev` — Resend's bundled sandbox
// sender that requires no domain verification. To send from
// `noreply@chefflow.uk` instead, verify chefflow.uk in Resend's dashboard
// (adds an MX + two TXT records), then pass `fromAddress` accordingly.
//
// The contact handler calls `sendContactNotification` AFTER the KV store
// write — KV is the source of truth, email is best-effort. A Resend
// outage must NOT prevent submissions from being recorded.

export interface ContactNotificationInput {
  name: string;
  email: string;
  message: string;
  /** Required at runtime — read from the RESEND_API_KEY worker secret. */
  apiKey: string;
  /** Recipient address — defaults to admin@chefflow.uk (which Cloudflare
   *  Email Routing forwards to the actual reading inbox). */
  toAddress?: string;
  /** From address. Defaults to Resend's no-verify sandbox sender. */
  fromAddress?: string;
  /** Optional injected fetch for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TO = 'admin@chefflow.uk';
const DEFAULT_FROM = 'ChefFlow Contact Form <onboarding@resend.dev>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export class MailNotificationError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'MailNotificationError';
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendContactNotification(input: ContactNotificationInput): Promise<void> {
  if (!input.apiKey || input.apiKey.length < 10) {
    throw new MailNotificationError('RESEND_API_KEY missing or malformed', 500);
  }
  const to = input.toAddress ?? DEFAULT_TO;
  const from = input.fromAddress ?? DEFAULT_FROM;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;

  const sentAt = new Date().toISOString();
  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.email);
  const safeMessage = escapeHtml(input.message);

  const textBody = [
    `New contact form submission`,
    ``,
    `From:    ${input.name} <${input.email}>`,
    `Sent at: ${sentAt}`,
    ``,
    `Message:`,
    input.message,
    ``,
    `---`,
    `Reply directly to this email to respond to the submitter.`,
  ].join('\n');

  const htmlBody = `<!doctype html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937;">
  <h2 style="margin: 0 0 12px 0;">New contact form submission</h2>
  <p style="margin: 0 0 4px 0;"><strong>From:</strong> ${safeName} &lt;<a href="mailto:${safeEmail}">${safeEmail}</a>&gt;</p>
  <p style="margin: 0 0 12px 0;"><strong>Sent at:</strong> ${sentAt}</p>
  <p style="margin: 0 0 4px 0;"><strong>Message:</strong></p>
  <pre style="white-space: pre-wrap; word-wrap: break-word; background: #f9fafb; padding: 12px; border-radius: 6px; font-family: inherit; margin: 0 0 12px 0;">${safeMessage}</pre>
  <p style="font-size: 12px; color: #6b7280;">Reply directly to this email to respond to the submitter.</p>
</body>
</html>`;

  const payload = {
    from,
    to: [to],
    subject: `Contact form: ${input.name}`,
    text: textBody,
    html: htmlBody,
    reply_to: input.email,
  };

  const res = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) return;

  let detail = '';
  try {
    detail = await res.text();
  } catch {
    // ignore
  }
  throw new MailNotificationError(
    `Resend send failed (${res.status}): ${detail.slice(0, 300)}`,
    res.status,
  );
}
