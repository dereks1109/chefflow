import { runAi } from './aiCall';
import { runGroq, GROQ_WORKFLOW_MODEL, GroqError } from './groqClient';
import { TEXT_MODEL, VISION_MODEL, type ProxyRequestBody } from './types';

export type EndpointName = 'generate' | 'analyze' | 'photo' | 'workflow';

export const ENDPOINTS: ReadonlySet<EndpointName> = new Set([
  'generate', 'analyze', 'photo', 'workflow',
]);

/**
 * Dispatch a request body to the right model.
 *
 * - generate / analyze / photo → Workers AI (Llama text / vision).
 * - workflow → Groq + Kimi K2 (if GROQ_API_KEY is set), with a
 *   graceful fallback to Workers AI Llama on missing-key OR runtime
 *   failure. Routing chosen for the workflow scheduler specifically
 *   because:
 *     - Kimi K2 reasons better over the prep-dependency / timing
 *       constraints the scheduler has to satisfy than Llama 3.3 70B.
 *     - Groq's LPU inference keeps chef-perceived latency under ~1.5s.
 *   The fallback means a missing secret never breaks the feature —
 *   the chef just gets the lower-quality Llama schedule.
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
          return await runGroq(groqApiKey, GROQ_WORKFLOW_MODEL, body);
        } catch (err) {
          // Best-effort upgrade: log + fall through to Workers AI so a
          // Groq outage / bad key / rate-limit doesn't break the
          // chef's workflow generation.
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
