// Client for the worker's GET /demos/list public endpoint. Used by
// the signed-out guest browse mode on /recipes + /events. No Clerk
// token (the endpoint is public, CDN-cached) — mirrors the read-only
// community client pattern.

import type { Recipe, KitchenEvent } from '../types';
import { getWorkerBaseUrl } from '../util/workerBaseUrl';

interface Options {
  origin?: string;
  fetchImpl?: typeof fetch;
}

function originOf(opts: Options): string {
  return (opts.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
}

export interface PublicDemos {
  recipes: Recipe[];
  events: KitchenEvent[];
}

export async function fetchPublicDemos(opts: Options = {}): Promise<PublicDemos> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${originOf(opts)}/demos/list`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Demos worker ${res.status}`);
  }
  return (await res.json()) as PublicDemos;
}
