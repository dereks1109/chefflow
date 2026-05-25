// Notice-and-takedown handlers for the community library. UK §97A of the
// CDPA 1988 + the EU eCommerce Directive Art. 14 give hosting providers
// "safe harbour" from infringement liability ONLY when there's a working
// notice-and-takedown procedure. The community library was missing one
// before this module — anyone can publish, but only the author could
// unpublish, leaving rights-holders with no path to remove infringing
// uploads. This module closes that gap.
//
// Three responsibilities:
//   - `submitReport`  : any signed-in user files a report (public-facing)
//   - `listReports`   : admin queue view (paged)
//   - `resolveReport` : admin marks the report resolved/dismissed; if the
//                       community recipe is gone, the report transitions
//                       to 'resolved' regardless (we don't surface KV
//                       errors back to the rights-holder).

import { get as communityGet, unpublish as communityUnpublish, CommunityNotFound, CommunityForbidden } from './community';

export type ReasonCode = 'copyright' | 'allergen_misinfo' | 'spam' | 'other';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';
export type ResolutionAction = 'unpublish' | 'dismiss';

export interface SubmitReportInput {
  communityRecipeId: string;
  reporterEmail?: string;
  reasonCode: ReasonCode;
  message?: string;
}

export interface TakedownReportRow {
  id: string;
  community_recipe_id: string;
  reporter_user_id: string;
  reporter_email: string | null;
  reason_code: ReasonCode;
  message: string | null;
  status: ReportStatus;
  reported_at: number;
  resolved_at: number | null;
  resolved_by_user_id: string | null;
  resolution_note: string | null;
}

export class TakedownValidationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'TakedownValidationError';
  }
}

const VALID_REASONS: ReasonCode[] = ['copyright', 'allergen_misinfo', 'spam', 'other'];

function genReportId(now: number): string {
  return `tdr_${now.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function submitReport(
  db: D1Database,
  reporterUserId: string,
  input: SubmitReportInput,
  now: number = Date.now(),
): Promise<{ id: string }> {
  if (!input.communityRecipeId || typeof input.communityRecipeId !== 'string') {
    throw new TakedownValidationError('communityRecipeId is required');
  }
  if (!VALID_REASONS.includes(input.reasonCode)) {
    throw new TakedownValidationError('reasonCode must be one of: ' + VALID_REASONS.join(', '));
  }
  const message = typeof input.message === 'string' ? input.message.slice(0, 2000) : null;
  const email = typeof input.reporterEmail === 'string' ? input.reporterEmail.slice(0, 256) : null;
  const id = genReportId(now);

  await db
    .prepare(
      `INSERT INTO takedown_reports
         (id, community_recipe_id, reporter_user_id, reporter_email,
          reason_code, message, status, reported_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(id, input.communityRecipeId, reporterUserId, email, input.reasonCode, message, now)
    .run();

  return { id };
}

export async function listReports(
  db: D1Database,
  opts: { status?: ReportStatus; limit?: number } = {},
): Promise<TakedownReportRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const status = opts.status;
  const sql = status
    ? `SELECT * FROM takedown_reports WHERE status = ? ORDER BY reported_at DESC LIMIT ?`
    : `SELECT * FROM takedown_reports ORDER BY reported_at DESC LIMIT ?`;
  const stmt = status
    ? db.prepare(sql).bind(status, limit)
    : db.prepare(sql).bind(limit);
  const res = await stmt.all<TakedownReportRow>();
  return res.results ?? [];
}

export async function resolveReport(
  db: D1Database,
  kv: KVNamespace,
  adminUserId: string,
  reportId: string,
  action: ResolutionAction,
  resolutionNote: string | null,
  now: number = Date.now(),
): Promise<{ status: ReportStatus; unpublishedRecipeId: string | null }> {
  const report = await db
    .prepare(`SELECT * FROM takedown_reports WHERE id = ?`)
    .bind(reportId)
    .first<TakedownReportRow>();
  if (!report) throw new TakedownValidationError('report not found', 404);
  if (report.status !== 'pending') {
    throw new TakedownValidationError(`report already ${report.status}`, 409);
  }

  let unpublishedRecipeId: string | null = null;
  let newStatus: ReportStatus = 'dismissed';

  if (action === 'unpublish') {
    try {
      // Admin path: bypass the author-only check by passing the recipe's
      // recorded author (we look it up first). The function still enforces
      // "match author == passed userId", which our adminUnpublish wrapper
      // satisfies by reading the author from KV and re-passing it.
      await adminUnpublish(kv, report.community_recipe_id);
      unpublishedRecipeId = report.community_recipe_id;
    } catch (err) {
      // If the recipe is already gone, the takedown still moves to resolved.
      if (!(err instanceof CommunityNotFound)) {
        throw err;
      }
    }
    newStatus = 'resolved';
  }

  await db
    .prepare(
      `UPDATE takedown_reports
         SET status = ?, resolved_at = ?, resolved_by_user_id = ?, resolution_note = ?
       WHERE id = ?`,
    )
    .bind(newStatus, now, adminUserId, resolutionNote, reportId)
    .run();

  return { status: newStatus, unpublishedRecipeId };
}

// Wrapper that re-reads the recipe to extract authorClerkId, then calls the
// existing user-scoped unpublish with that author. Lets admin remove without
// modifying community.ts's contract (author-only delete stays the rule;
// admin reaches the same code path by acting "as" the author).
async function adminUnpublish(kv: KVNamespace, communityRecipeId: string): Promise<void> {
  const record = await communityGet(kv, communityRecipeId);
  if (!record) throw new CommunityNotFound();
  try {
    await communityUnpublish(kv, record.authorClerkId, communityRecipeId);
  } catch (err) {
    if (err instanceof CommunityForbidden) {
      // Shouldn't happen — we just read authorClerkId from the same record.
      throw new TakedownValidationError('internal author mismatch', 500);
    }
    throw err;
  }
}
