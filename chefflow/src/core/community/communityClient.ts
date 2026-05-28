// Client for the chefflow-worker /community/* endpoints. Mirrors the shape
// of `quotaClient` — same Clerk JWT fetch, same E2E bypass.

import type { Recipe } from '../types';
import { getWorkerBaseUrl } from '../util/workerBaseUrl';

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
  sourceLocalId?: string;
  publishedAt: number;
  likes: number;
  copies: number;
}

export interface CommunityRecipeSummary {
  id: string;
  /** The author's LOCAL recipe id (e.g. `r_demo_ribeye`). Used by the card
   *  to look up bundled demo photos via demoPhotoMap. */
  sourceLocalId?: string;
  title: string;
  coverPhoto?: string;
  /** Clerk id of the author — present on summaries served by the worker.
   *  Powers the /chef/:clerkId profile link from cards + recipe pages. */
  authorClerkId?: string;
  authorDisplayName: string;
  likes: number;
  copies: number;
  publishedAt: number;
  /** Portion count from the source recipe. Optional for backward-compat
   *  with summaries cached before this field was added. */
  originalYield?: number;
  /** Card tags — reversed the 1bc960d carve-out on 2026-05-28: the
   *  publishing chef's allergen attestation is now displayed alongside
   *  their free-form otherTags. The community-library
   *  CommunityDisclaimerBanner is the legal mitigation: "Community
   *  recipes are author-declared and not verified by ChefFlow". */
  tags?: {
    allergens?: string[];
    otherTags?: string[];
  };
}

export class CommunityClientError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CommunityClientError';
    this.status = status;
  }
}

async function getClerkToken(): Promise<string | null> {
  const clerk = (window as unknown as {
    Clerk?: { session?: { getToken(): Promise<string | null> } };
  }).Clerk;
  return clerk?.session ? await clerk.session.getToken() : null;
}

function isE2E(): boolean {
  return (import.meta.env.VITE_E2E_MODE as string | undefined) === 'true';
}

interface Options {
  origin?: string;
  fetchImpl?: typeof fetch;
}

function originOf(opts: Options): string {
  return (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
}

/**
 * Publish a recipe to the community. In E2E mode we short-circuit and return
 * a synthetic id so the editor flow is exercisable without hitting the worker.
 */
export async function publishRecipe(
  recipe: Recipe,
  displayName: string,
  opts: Options = {},
): Promise<{ id: string }> {
  if (isE2E()) {
    return { id: `cr_e2e_${recipe.id}` };
  }
  const token = await getClerkToken();
  if (!token) throw new CommunityClientError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/community/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      recipe: {
        id: recipe.id,
        title: recipe.title,
        description: recipe.description,
        originalYield: recipe.originalYield,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        coverPhoto: recipe.coverPhoto,
        analysis: recipe.analysis,
      },
      displayName,
    }),
  });
  if (!res.ok) throw new CommunityClientError(`Community worker ${res.status}`, res.status);
  return (await res.json()) as { id: string };
}

export async function unpublishRecipe(communityId: string, opts: Options = {}): Promise<void> {
  if (isE2E()) return;
  const token = await getClerkToken();
  if (!token) throw new CommunityClientError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/community/${communityId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new CommunityClientError(`Community worker ${res.status}`, res.status);
}

export async function listCommunityRecipes(opts: Options = {}): Promise<CommunityRecipeSummary[]> {
  if (isE2E()) return [];
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/community/list`, { method: 'GET' });
  if (!res.ok) throw new CommunityClientError(`Community worker ${res.status}`, res.status);
  const body = (await res.json()) as { items: CommunityRecipeSummary[] };
  return body.items;
}

export async function listCommunityRecipesByAuthor(
  authorClerkId: string,
  opts: Options = {},
): Promise<CommunityRecipeSummary[]> {
  if (isE2E()) return [];
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(
    `${originOf(opts)}/community/by-author/${encodeURIComponent(authorClerkId)}`,
    { method: 'GET' },
  );
  if (!res.ok) throw new CommunityClientError(`Community worker ${res.status}`, res.status);
  const body = (await res.json()) as { items: CommunityRecipeSummary[] };
  return body.items;
}

export async function getCommunityRecipe(
  communityId: string,
  opts: Options = {},
): Promise<CommunityRecipe | null> {
  if (isE2E()) return null;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/community/${communityId}`, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new CommunityClientError(`Community worker ${res.status}`, res.status);
  return (await res.json()) as CommunityRecipe;
}

export async function toggleLike(
  communityId: string,
  opts: Options = {},
): Promise<{ liked: boolean; likes: number }> {
  if (isE2E()) return { liked: true, likes: 1 };
  const token = await getClerkToken();
  if (!token) throw new CommunityClientError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/community/${communityId}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new CommunityClientError(`Community worker ${res.status}`, res.status);
  return (await res.json()) as { liked: boolean; likes: number };
}

export async function getLiked(
  communityId: string,
  opts: Options = {},
): Promise<boolean> {
  if (isE2E()) return false;
  const token = await getClerkToken();
  if (!token) return false;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/community/${communityId}/like`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { liked: boolean };
  return body.liked;
}

export async function recordCopy(
  communityId: string,
  opts: Options = {},
): Promise<{ copied: true; copies: number }> {
  if (isE2E()) return { copied: true, copies: 1 };
  const token = await getClerkToken();
  if (!token) throw new CommunityClientError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/community/${communityId}/copy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new CommunityClientError(`Community worker ${res.status}`, res.status);
  return (await res.json()) as { copied: true; copies: number };
}

/**
 * Rewind a recorded copy. Fired by the recipes repo when the user deletes
 * a local recipe that carries a `copiedFromCommunityId`. Idempotent + safe
 * to retry; the worker treats "user never copied" as a no-op.
 */
export async function uncopyRecipe(
  communityId: string,
  opts: Options = {},
): Promise<{ copied: false; copies: number }> {
  if (isE2E()) return { copied: false, copies: 0 };
  const token = await getClerkToken();
  if (!token) throw new CommunityClientError('Not signed in', 401);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/community/${communityId}/uncopy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new CommunityClientError(`Community worker ${res.status}`, res.status);
  return (await res.json()) as { copied: false; copies: number };
}
