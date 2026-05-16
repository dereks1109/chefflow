import type { ProxyRequestBody } from './types';

/**
 * Call Workers AI with a chat-completion shape. Forwards the user-supplied
 * system + user messages verbatim — the worker holds NO prompts of its own,
 * so the SPA's prompt builders remain the single source of truth.
 */
export async function runAi(
  ai: Ai,
  model: string,
  body: ProxyRequestBody,
): Promise<string> {
  const userContent = body.userContent !== undefined ? body.userContent : body.userPrompt;
  if (userContent === undefined || userContent === '') {
    throw new Error('Request must include userPrompt or userContent');
  }
  const responseType = body.jsonMode === false ? 'text' : 'json_object';
  const payload = {
    messages: [
      { role: 'system', content: body.systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: responseType },
  };
  // Workers AI returns { response: string } for chat-completion models.
  const result = (await ai.run(model, payload)) as { response?: string };
  const content = result?.response ?? '';
  if (!content) throw new Error('Empty AI response');
  return content;
}
