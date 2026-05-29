import { runAi } from './aiCall';
import { runGroqWithFallback, GroqError } from './groqClient';
import { TEXT_MODEL, VISION_MODEL, type ProxyRequestBody } from './types';

export type EndpointName = 'generate' | 'analyze' | 'photo' | 'workflow';

export const ENDPOINTS: ReadonlySet<EndpointName> = new Set([
  'generate', 'analyze', 'photo', 'workflow',
]);

/**
 * Dispatch a request body to the right model.
 *
 * - generate / analyze / photo → Workers AI (Llama text / vision).
 * - workflow → tri-tier fallback for resilience + speed:
 *     1. Groq + Llama 3.3 70B (~500ms, fast primary)
 *     2. Groq + Kimi K2 (~1-2s, smarter — handles complex multi-dish
 *        events that confuse Llama). Internal to runGroqWithFallback.
 *     3. Workers AI Llama 3.3 70B fp8 (~3s, free safety net when both
 *        Groq tiers are down or GROQ_API_KEY is unset).
 *   The cascade means a Groq outage / missing key / rate-limit never
 *   breaks the chef's workflow generation — they just see slightly
 *   worse latency.
 *
 * The photo endpoint defaults jsonMode=false because the vision model
 * on CF sometimes ignores JSON mode — the SPA validator tolerates
 * markdown fences around JSON.
 */
export async function handleEndpoint(
  name: EndpointName,
  ai: Ai,
  body: ProxyRequestBody,
  groqApiKey?: string,
): Promise<string> {
  switch (name) {
    case 'generate':
    case 'analyze':
      return runAi(ai, TEXT_MODEL, body);
    case 'workflow':
      if (groqApiKey) {
        try {
          return await runGroqWithFallback(groqApiKey, body);
        } catch (err) {
          // Both Groq tiers (Llama 3.3 + Kimi K2) failed — log + fall
          // through to Workers AI so the chef still gets a workflow.
          if (err instanceof GroqError) {
            console.warn('[handleEndpoint] Groq workflow call failed, falling back to Workers AI:', err.status, err.message);
          } else {
            console.warn('[handleEndpoint] Groq workflow call threw, falling back to Workers AI:', err instanceof Error ? err.message : String(err));
          }
        }
      }
      return runAi(ai, TEXT_MODEL, body);
    case 'photo':
      return runAi(ai, VISION_MODEL, { ...body, jsonMode: body.jsonMode ?? false });
    default:
      throw new Error(`Unknown endpoint: ${String(name)}`);
  }
}
