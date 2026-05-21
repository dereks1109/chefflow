// Single source of truth for the chefflow-worker URL the SPA calls.
// VITE_WORKER_BASE_URL is set at build time (Cloudflare env var) in prod
// where the SPA and worker live on separate origins. Falls back to empty
// = same-origin for local dev (where Vite proxies the worker or the user
// runs `wrangler dev` on the same port).
export function getWorkerBaseUrl(): string {
  const raw = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined) ?? '';
  return raw.replace(/\/+$/, '');
}
