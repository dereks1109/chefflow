import type { MultimodalPart } from '../scheduler/llm/groqClient';
import { getWorkerBaseUrl } from '../util/workerBaseUrl';

export type ProxyEndpoint = 'generate' | 'analyze' | 'photo' | 'workflow';

export interface ProxyCompletionInput {
  endpoint: ProxyEndpoint;
  systemPrompt: string;
  userPrompt?: string;
  userContent?: string | MultimodalPart[];
  signal?: AbortSignal;
  /** Origin override for cross-host dev (default: same origin). */
  origin?: string;
  /** Test injection. */
  fetchImpl?: typeof fetch;
}

export class ProxyClientError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly upstreamBody?: string;
  constructor(message: string, status: number, opts?: { retryAfterSeconds?: number; upstreamBody?: string }) {
    super(message);
    this.name = 'ProxyClientError';
    this.status = status;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
    this.upstreamBody = opts?.upstreamBody;
  }
}

/**
 * Send an LLM request to the chefflow-llm-proxy Worker. The Clerk session
 * provides the JWT; the SPA never holds a raw API key.
 */
export async function proxyComplete(input: ProxyCompletionInput): Promise<string> {
  const clerk = (window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }).Clerk;
  const token = clerk?.session ? await clerk.session.getToken() : null;
  if (!token) throw new ProxyClientError('Not signed in', 401);

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const origin = (input.origin ?? getWorkerBaseUrl()).replace(/\/+$/, '');
  const url = `${origin}/api/llm/${input.endpoint}`;

  const body: Record<string, unknown> = { systemPrompt: input.systemPrompt };
  if (input.userContent !== undefined) body.userContent = input.userContent;
  else if (input.userPrompt !== undefined) body.userPrompt = input.userPrompt;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProxyClientError(`Network error: ${msg}`, 0);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const retryAfter = res.headers.get('Retry-After');
    throw new ProxyClientError(
      `Proxy ${res.status} ${res.statusText}`,
      res.status,
      {
        retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : undefined,
        upstreamBody: text.slice(0, 800),
      },
    );
  }

  const payload = (await res.json()) as { content?: string };
  const content = payload.content ?? '';
  if (!content) throw new ProxyClientError('Proxy returned empty content', 502);
  return content;
}
