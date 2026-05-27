// KV-backed CRUD for community recipes. Same read-then-put pattern as
// `consumeQuota` — fine at V1 scale. Key prefixes namespace this from the
// quota counters (which use `q:`).

const KEY_RECIPE_PREFIX = 'c:r:';
const KEY_INDEX = 'c:i:byPublishedDesc';
const KEY_LIKE_PREFIX = 'c:l:';
const KEY_COPY_PREFIX = 'c:cp:';

// Cap the recent-list size so the index entry stays well under KV's 25 MB value
// limit. At V1 the UI shows newest 50 — this leaves plenty of headroom.
const INDEX_MAX_ENTRIES = 500;

export interface SourceRecipe {
  /** Local Dexie id of the source recipe — used to recognise republishes. */
  id?: string;
  title: string;
  description?: string;
  originalYield: number;
  ingredients: unknown[];
  steps: unknown[];
  coverPhoto?: string;
  analysis?: unknown;
}

export interface CommunityRecipe {
  id: string;
  title: string;
  description?: string;
  originalYield: number;
  ingredients: unknown[];
  steps: unknown[];
  coverPhoto?: string;
  analysis?: unknown;
  authorClerkId: string;
  authorDisplayName: string;
  /** Local recipe id at publish time — keys idempotent republish. */
  sourceLocalId?: string;
  publishedAt: number;
  likes: number;
  copies: number;
}

export interface CommunityRecipeSummary {
  id: string;
  /** The author's LOCAL recipe id (e.g. `r_demo_ribeye`). Projected so the
   *  SPA card can look up bundled demo photos via demoPhotoMap and so the
   *  user's library can detect "I already have this copied" later. */
  sourceLocalId?: string;
  title: string;
  coverPhoto?: string;
  /** Clerk id of the author, projected so the SPA can link cards to the
   *  /chef/:clerkId profile page. Optional for backward-compat with
   *  summaries that may have been cached before this field was added. */
  authorClerkId?: string;
  authorDisplayName: string;
  likes: number;
  copies: number;
  publishedAt: number;
  /** Portion count from the source recipe — surfaced on the card so chefs
   *  see "yields 4" at a glance. */
  originalYield: number;
  // Tags previously projected on each summary card (allergens, then later
  // just keyIngredientTags) were dropped 2026-05-28. The publishing chef
  // remains the food business operator under FIR 2014, and the
  // keyIngredientTags feature itself was scrapped.
}

interface IndexEntry {
  id: string;
  publishedAt: number;
}

export class CommunityForbidden extends Error {
  constructor(message = 'Only the author can perform this action') {
    super(message);
    this.name = 'CommunityForbidden';
  }
}

export class CommunityNotFound extends Error {
  constructor(message = 'Community recipe not found') {
    super(message);
    this.name = 'CommunityNotFound';
  }
}

function genCommunityId(now: number): string {
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `cr_${now.toString(36)}_${rand}`;
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
  // Trim to a reasonable cap, newest first.
  const trimmed = entries.slice(0, INDEX_MAX_ENTRIES);
  await kv.put(KEY_INDEX, JSON.stringify(trimmed));
}

async function readRecipe(kv: KVNamespace, id: string): Promise<CommunityRecipe | null> {
  const raw = await kv.get(`${KEY_RECIPE_PREFIX}${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CommunityRecipe;
  } catch {
    return null;
  }
}

export async function publish(
  kv: KVNamespace,
  userId: string,
  displayName: string,
  recipe: SourceRecipe,
  now: number = Date.now(),
): Promise<{ id: string }> {
  const sourceLocalId = recipe.id;

  // Idempotent republish: if the same author has already published this exact
  // local recipe id, replace the existing record in place (preserve counters).
  let existing: CommunityRecipe | null = null;
  if (sourceLocalId) {
    const index = await readIndex(kv);
    for (const entry of index) {
      const r = await readRecipe(kv, entry.id);
      if (r && r.authorClerkId === userId && r.sourceLocalId === sourceLocalId) {
        existing = r;
        break;
      }
    }
  }

  const trimmedName = (displayName ?? '').trim();
  const authorDisplayName = trimmedName === '' ? 'Anonymous chef' : trimmedName;

  if (existing) {
    const updated: CommunityRecipe = {
      ...existing,
      title: recipe.title,
      description: recipe.description,
      originalYield: recipe.originalYield,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      coverPhoto: recipe.coverPhoto,
      analysis: recipe.analysis,
      authorDisplayName,
    };
    await kv.put(`${KEY_RECIPE_PREFIX}${existing.id}`, JSON.stringify(updated));
    return { id: existing.id };
  }

  const id = genCommunityId(now);
  const record: CommunityRecipe = {
    id,
    title: recipe.title,
    description: recipe.description,
    originalYield: recipe.originalYield,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    coverPhoto: recipe.coverPhoto,
    analysis: recipe.analysis,
    authorClerkId: userId,
    authorDisplayName,
    sourceLocalId,
    publishedAt: now,
    likes: 0,
    copies: 0,
  };
  await kv.put(`${KEY_RECIPE_PREFIX}${id}`, JSON.stringify(record));

  const index = await readIndex(kv);
  index.unshift({ id, publishedAt: now });
  await writeIndex(kv, index);

  return { id };
}

export async function unpublish(
  kv: KVNamespace,
  userId: string,
  communityId: string,
): Promise<void> {
  const record = await readRecipe(kv, communityId);
  if (!record) throw new CommunityNotFound();
  if (record.authorClerkId !== userId) throw new CommunityForbidden();

  await kv.delete(`${KEY_RECIPE_PREFIX}${communityId}`);

  const index = await readIndex(kv);
  const next = index.filter((e) => e.id !== communityId);
  if (next.length !== index.length) {
    await writeIndex(kv, next);
  }

  // Best-effort: delete any like markers tied to this recipe. KV.list can be
  // paginated; loop until exhausted. Worst-case O(likes) — acceptable at V1.
  const likePrefix = `${KEY_LIKE_PREFIX}${communityId}:`;
  let cursor: string | undefined;
  do {
    const page: KVNamespaceListResult<unknown, string> = await kv.list({
      prefix: likePrefix,
      cursor,
    });
    for (const k of page.keys) {
      await kv.delete(k.name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

export async function listRecent(
  kv: KVNamespace,
  limit = 50,
): Promise<CommunityRecipeSummary[]> {
  const index = await readIndex(kv);
  const slice = index.slice(0, limit);
  const records = await Promise.all(slice.map((e) => readRecipe(kv, e.id)));
  const out: CommunityRecipeSummary[] = [];
  for (const r of records) {
    if (!r) continue;
    out.push({
      id: r.id,
      sourceLocalId: r.sourceLocalId,
      title: r.title,
      coverPhoto: r.coverPhoto,
      authorClerkId: r.authorClerkId,
      authorDisplayName: r.authorDisplayName,
      likes: r.likes,
      copies: r.copies,
      publishedAt: r.publishedAt,
      originalYield: r.originalYield,
    });
  }
  return out;
}

/**
 * Same projection as listRecent but filtered to a single author. Powers the
 * /community/by-author/:clerkId endpoint and the SPA ChefProfile page.
 * Newest-first.
 */
export async function listByAuthor(
  kv: KVNamespace,
  authorClerkId: string,
  limit = 100,
): Promise<CommunityRecipeSummary[]> {
  const index = await readIndex(kv);
  const records = await Promise.all(index.map((e) => readRecipe(kv, e.id)));
  const out: CommunityRecipeSummary[] = [];
  for (const r of records) {
    if (!r) continue;
    if (r.authorClerkId !== authorClerkId) continue;
    out.push({
      id: r.id,
      sourceLocalId: r.sourceLocalId,
      title: r.title,
      coverPhoto: r.coverPhoto,
      authorClerkId: r.authorClerkId,
      authorDisplayName: r.authorDisplayName,
      likes: r.likes,
      copies: r.copies,
      publishedAt: r.publishedAt,
      originalYield: r.originalYield,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function get(kv: KVNamespace, communityId: string): Promise<CommunityRecipe | null> {
  return readRecipe(kv, communityId);
}

export async function toggleLike(
  kv: KVNamespace,
  userId: string,
  communityId: string,
): Promise<{ liked: boolean; likes: number }> {
  const record = await readRecipe(kv, communityId);
  if (!record) throw new CommunityNotFound();

  const likeKey = `${KEY_LIKE_PREFIX}${communityId}:${userId}`;
  const existing = await kv.get(likeKey);

  if (existing) {
    await kv.delete(likeKey);
    const likes = Math.max(0, record.likes - 1);
    const updated: CommunityRecipe = { ...record, likes };
    await kv.put(`${KEY_RECIPE_PREFIX}${communityId}`, JSON.stringify(updated));
    return { liked: false, likes };
  }

  // KV rejects empty values, hence the "1" sentinel — presence is what matters.
  await kv.put(likeKey, '1');
  const likes = record.likes + 1;
  const updated: CommunityRecipe = { ...record, likes };
  await kv.put(`${KEY_RECIPE_PREFIX}${communityId}`, JSON.stringify(updated));
  return { liked: true, likes };
}

export async function hasLiked(
  kv: KVNamespace,
  userId: string,
  communityId: string,
): Promise<boolean> {
  const existing = await kv.get(`${KEY_LIKE_PREFIX}${communityId}:${userId}`);
  return existing !== null;
}

/**
 * Per-user idempotent copy: once a user has copied a community recipe, repeat
 * calls are no-ops (counter stays put). Mirrors `toggleLike`'s KV-marker
 * pattern so the counter can later be rewound by `uncopyRecipe` when the
 * user deletes their local copy.
 */
export async function recordCopy(
  kv: KVNamespace,
  userId: string,
  communityId: string,
): Promise<{ copied: true; copies: number }> {
  const record = await readRecipe(kv, communityId);
  if (!record) throw new CommunityNotFound();

  const copyKey = `${KEY_COPY_PREFIX}${communityId}:${userId}`;
  const existing = await kv.get(copyKey);
  if (existing) {
    // Already copied — no double-counting. Return the current count so
    // the SPA can refresh its UI without a second read.
    return { copied: true, copies: record.copies };
  }

  await kv.put(copyKey, '1');
  const copies = record.copies + 1;
  const updated: CommunityRecipe = { ...record, copies };
  await kv.put(`${KEY_RECIPE_PREFIX}${communityId}`, JSON.stringify(updated));
  return { copied: true, copies };
}

/**
 * Rewind: when a user deletes the recipe they copied from community, the
 * SPA fires this to decrement the global copies counter. No-op when the
 * user never had a recorded copy (idempotent + safe to retry).
 */
export async function uncopyRecipe(
  kv: KVNamespace,
  userId: string,
  communityId: string,
): Promise<{ copied: false; copies: number }> {
  const record = await readRecipe(kv, communityId);
  if (!record) throw new CommunityNotFound();

  const copyKey = `${KEY_COPY_PREFIX}${communityId}:${userId}`;
  const existing = await kv.get(copyKey);
  if (!existing) {
    // Never had a recorded copy under this user — return current count.
    return { copied: false, copies: record.copies };
  }

  await kv.delete(copyKey);
  // Math.max guards against any historical drift (e.g. counter was already
  // 0 because someone admin-reset it but the per-user marker survived).
  const copies = Math.max(0, record.copies - 1);
  const updated: CommunityRecipe = { ...record, copies };
  await kv.put(`${KEY_RECIPE_PREFIX}${communityId}`, JSON.stringify(updated));
  return { copied: false, copies };
}
