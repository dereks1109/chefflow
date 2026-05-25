// Server-side mirror of the SPA's local allergen-removal audit log. Each
// chef's device still owns the source of truth (Dexie); this worker accepts
// best-effort PUSH copies from signed-in chefs so the admin can see a
// cross-user view at /admin/allergen-audits.
//
// Storage shape mirrors community.ts:
//   audit:al:<id>            → JSON of AllergenAuditServerEntry
//   audit:al:i:byRemovedDesc → JSON IndexEntry[] (newest first, capped)
//
// Anonymous removals (signed-out chefs) are NOT synced — the API requires a
// Clerk JWT, the SPA gates the POST behind sign-in. Cross-device sync is
// best-effort: if the POST fails, the local entry keeps `synced=false` and
// gets retried next time the editor opens.

const KEY_ENTRY_PREFIX = 'audit:al:';
const KEY_INDEX = 'audit:al:i:byRemovedDesc';
const INDEX_MAX_ENTRIES = 2000;

export type AllergenRemovalReason =
  | 'ingredient-changed'
  | 'recipe-changed'
  | 'mistakenly-added'
  | 'other';

export interface AllergenAuditClientEntry {
  id: string;
  recipeId: string;
  recipeTitleAtTime: string;
  removedTag: string;
  reasons: AllergenRemovalReason[];
  otherText?: string;
  ingredientsAtTime: string[];
  removedAt: number;
  userDisplayName?: string;
}

export interface AllergenAuditServerEntry extends AllergenAuditClientEntry {
  /** Authoritative — pulled from the verified Clerk token, NOT the SPA body.
   *  Guards against a client spoofing someone else's userClerkId. */
  userClerkId: string;
  /** When the worker persisted the record (not necessarily when the
   *  removal happened on the chef's device). */
  receivedAt: number;
}

interface IndexEntry {
  id: string;
  removedAt: number;
}

export class AllergenAuditValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'AllergenAuditValidationError';
  }
}

const VALID_REASONS: ReadonlySet<string> = new Set([
  'ingredient-changed',
  'recipe-changed',
  'mistakenly-added',
  'other',
]);

function validate(body: unknown): AllergenAuditClientEntry {
  if (!body || typeof body !== 'object') {
    throw new AllergenAuditValidationError('Body must be JSON');
  }
  const b = body as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id : '';
  const recipeId = typeof b.recipeId === 'string' ? b.recipeId : '';
  const recipeTitleAtTime = typeof b.recipeTitleAtTime === 'string' ? b.recipeTitleAtTime : '';
  const removedTag = typeof b.removedTag === 'string' ? b.removedTag : '';
  const removedAt = typeof b.removedAt === 'number' && Number.isFinite(b.removedAt) ? b.removedAt : 0;
  const reasonsRaw = Array.isArray(b.reasons) ? b.reasons : [];
  const reasons = reasonsRaw.filter((r): r is AllergenRemovalReason =>
    typeof r === 'string' && VALID_REASONS.has(r),
  );
  const otherText = typeof b.otherText === 'string' ? b.otherText : undefined;
  const ingredientsAtTimeRaw = Array.isArray(b.ingredientsAtTime) ? b.ingredientsAtTime : [];
  const ingredientsAtTime = ingredientsAtTimeRaw.filter((x): x is string => typeof x === 'string');
  const userDisplayName = typeof b.userDisplayName === 'string' ? b.userDisplayName : undefined;

  if (!id) throw new AllergenAuditValidationError('id required');
  if (!recipeId) throw new AllergenAuditValidationError('recipeId required');
  if (!removedTag) throw new AllergenAuditValidationError('removedTag required');
  if (reasons.length === 0) throw new AllergenAuditValidationError('At least one reason required');
  if (!removedAt) throw new AllergenAuditValidationError('removedAt required (epoch ms)');

  return {
    id,
    recipeId,
    recipeTitleAtTime,
    removedTag,
    reasons,
    otherText,
    ingredientsAtTime,
    removedAt,
    userDisplayName,
  };
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

/**
 * Persist an audit entry. Idempotent on `id` — re-pushing the same record
 * (e.g. after a network flake) overwrites the previous one and does NOT
 * duplicate the index entry.
 */
export async function submit(
  kv: KVNamespace,
  userId: string,
  body: unknown,
  now: number = Date.now(),
): Promise<{ id: string }> {
  const client = validate(body);
  const record: AllergenAuditServerEntry = {
    ...client,
    userClerkId: userId,
    receivedAt: now,
  };
  await kv.put(`${KEY_ENTRY_PREFIX}${client.id}`, JSON.stringify(record));

  const index = await readIndex(kv);
  const without = index.filter((e) => e.id !== client.id);
  without.unshift({ id: client.id, removedAt: client.removedAt });
  // Keep newest-removedAt at the top.
  without.sort((a, b) => b.removedAt - a.removedAt);
  await writeIndex(kv, without);

  return { id: client.id };
}

/**
 * List all audit entries, newest-first by removedAt. Powers the admin
 * dashboard panel.
 */
export async function listAll(
  kv: KVNamespace,
  limit = 200,
): Promise<AllergenAuditServerEntry[]> {
  const index = await readIndex(kv);
  const slice = index.slice(0, limit);
  const records = await Promise.all(
    slice.map(async (e) => {
      const raw = await kv.get(`${KEY_ENTRY_PREFIX}${e.id}`);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as AllergenAuditServerEntry;
      } catch {
        return null;
      }
    }),
  );
  return records.filter((r): r is AllergenAuditServerEntry => r !== null);
}
