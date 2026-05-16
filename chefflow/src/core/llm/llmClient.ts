import { complete as groqComplete, type MultimodalPart } from '../scheduler/llm/groqClient';
import { proxyComplete, type ProxyEndpoint } from './proxyClient';

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
    return proxyComplete({
      endpoint: input.endpoint,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      userContent: input.userContent,
      signal: input.signal,
    });
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
