import { runAi } from './aiCall';
import { TEXT_MODEL, VISION_MODEL, type ProxyRequestBody } from './types';

export type EndpointName = 'generate' | 'analyze' | 'photo' | 'workflow';

export const ENDPOINTS: ReadonlySet<EndpointName> = new Set([
  'generate', 'analyze', 'photo', 'workflow',
]);

/**
 * Dispatch a request body to the right Workers AI model. The photo endpoint
 * defaults to plain-text response format because the vision model on CF
 * sometimes ignores JSON mode — the SPA validator already tolerates
 * markdown fences around JSON.
 */
export async function handleEndpoint(
  name: EndpointName,
  ai: Ai,
  body: ProxyRequestBody,
): Promise<string> {
  switch (name) {
    case 'generate':
    case 'analyze':
    case 'workflow':
      return runAi(ai, TEXT_MODEL, body);
    case 'photo':
      return runAi(ai, VISION_MODEL, { ...body, jsonMode: body.jsonMode ?? false });
    default:
      throw new Error(`Unknown endpoint: ${String(name)}`);
  }
}
