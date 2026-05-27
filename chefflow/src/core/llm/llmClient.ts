import { complete as groqComplete, type MultimodalPart } from '../scheduler/llm/groqClient';
import { ProxyClientError, proxyComplete, type ProxyEndpoint } from './proxyClient';

export interface CompletionInput {
  endpoint: ProxyEndpoint;
  systemPrompt: string;
  userPrompt?: string;
  userContent?: string | MultimodalPart[];
  signal?: AbortSignal;
  /** Used only in groq mode. */
  apiKey: string;
  model: string;
  /** Used only in groq mode. */
  baseUrl?: string;
  /** Used only in groq mode. */
  fetchImpl?: typeof fetch;
}

/**
 * Thrown when a proxy-mode LLM call hits the ChefFlow daily-quota cap
 * (worker `consumeQuota(env.RATE_LIMIT, userId, 'llm', limit)` →
 * QuotaExceeded → 429 with `{kind:'llm'}`). Distinguished from a generic
 * upstream rate-limit so call sites can open the UpgradeSheet with a
 * conversion CTA instead of telling the chef to "wait a minute".
 *
 * Groq-mode (BYO-key) 429s are NOT translated to this error — those are
 * Groq's own per-key rate limits and the chef can't pay us to fix them.
 */
export class LlmDailyQuotaExceededError extends Error {
  readonly retryAfterSeconds?: number;
  constructor(message = 'Daily AI quota exceeded', retryAfterSeconds?: number) {
    super(message);
    this.name = 'LlmDailyQuotaExceededError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isLlmQuotaExceeded(err: unknown): boolean {
  if (!(err instanceof ProxyClientError)) return false;
  if (err.status !== 429) return false;
  // Worker shape: { error: "Daily quota exceeded for llm", kind: "llm" }.
  // Detect by `kind === 'llm'` after JSON-parsing. Belt-and-braces fallback
  // on the literal "quota" substring in the body for forward compatibility
  // if the kind tag ever changes name.
  const body = err.upstreamBody ?? '';
  try {
    const parsed = JSON.parse(body) as { kind?: unknown; error?: unknown };
    if (parsed.kind === 'llm') return true;
  } catch {
    // body wasn't JSON — fall through to substring check.
  }
  return body.toLowerCase().includes('quota');
}

/**
 * Pick proxy vs direct-Groq based on build-time env. Production deploys set
 * VITE_LLM_MODE=proxy in Cloudflare Pages env vars; local dev defaults to
 * 'groq' so you don't need a running Worker.
 *
 * Evaluated per-call (not cached) so test-time env mutations are respected.
 */
function currentMode(): 'proxy' | 'groq' {
  return (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy' ? 'proxy' : 'groq';
}

export async function complete(input: CompletionInput): Promise<string> {
  if (currentMode() === 'proxy') {
    try {
      return await proxyComplete({
        endpoint: input.endpoint,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        userContent: input.userContent,
        signal: input.signal,
      });
    } catch (err) {
      if (isLlmQuotaExceeded(err)) {
        const retryAfter = err instanceof ProxyClientError ? err.retryAfterSeconds : undefined;
        throw new LlmDailyQuotaExceededError(
          'Daily AI quota exceeded — upgrade to Pro for more',
          retryAfter,
        );
      }
      throw err;
    }
  }
  // Groq path — uses the existing client and accepts the same shape.
  return groqComplete({
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    userContent: input.userContent,
    signal: input.signal,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
  });
}
