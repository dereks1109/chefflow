// ---------------------------------------------------------------------------
// Thin client for Groq's OpenAI-compatible chat-completions endpoint.
// We use Groq's free tier; the same shape works on OpenAI / OpenRouter /
// Together / Ollama (just swap the base URL + API key), which is why
// `complete()` accepts both.
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

// Multimodal user content (OpenAI-compatible). Vision-capable models accept an
// array of parts mixing text + image_url; text-only models only see strings.
// We keep the union narrow — text + image_url cover the recipe-photo flow.
export type MultimodalPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface GroqCompletionInput {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt?: string;                          // legacy plain-text path (still supported)
  userContent?: string | MultimodalPart[];      // new: multimodal user message; wins over userPrompt if both given
  temperature?: number;          // default 0 for deterministic-ish output
  responseFormat?: 'json_object' | 'text';      // default 'json_object'; vision models may not honor JSON mode
  baseUrl?: string;              // override for testing / alternative providers
  fetchImpl?: typeof fetch;      // injectable for unit tests
  signal?: AbortSignal;          // cancellation
}

/** Thrown on any non-OK HTTP, network failure, or empty payload. */
export class GroqClientError extends Error {
  readonly status?: number;
  readonly upstreamBody?: string;
  constructor(message: string, status?: number, upstreamBody?: string) {
    super(message);
    this.name = 'GroqClientError';
    this.status = status;
    this.upstreamBody = upstreamBody;
  }
}

/**
 * Sends a chat-completion request and returns the assistant message content
 * (a JSON string, by virtue of `response_format: { type: "json_object" }`).
 * Callers should pass that string to `parseLlmResponse()`.
 */
export async function complete(input: GroqCompletionInput): Promise<string> {
  const {
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    userContent,
    temperature = 0,
    responseFormat = 'json_object',
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    signal,
  } = input;

  if (!apiKey || !apiKey.trim()) {
    throw new GroqClientError('Missing API key');
  }

  // userContent wins when provided (multimodal); otherwise fall back to the
  // legacy plain-text path. We never emit an array body for a plain string,
  // so existing text-only callers see byte-identical payloads.
  const messageContent: string | MultimodalPart[] =
    userContent !== undefined ? userContent : (userPrompt ?? '');

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: messageContent },
    ],
    response_format: { type: responseFormat },
    temperature,
  };

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GroqClientError(`Network error: ${message}`);
  }

  if (!response.ok) {
    const text = await safeReadText(response);
    throw new GroqClientError(
      `Groq API error (${response.status} ${response.statusText})`,
      response.status,
      text,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GroqClientError('Groq returned non-JSON body');
  }

  const content = extractContent(payload);
  if (!content) {
    throw new GroqClientError('Groq response had no content', undefined, JSON.stringify(payload).slice(0, 400));
  }
  return content;
}

function extractContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const choices = obj.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  const content = message?.content;
  return typeof content === 'string' && content.length > 0 ? content : null;
}

async function safeReadText(r: Response): Promise<string | undefined> {
  try {
    return (await r.text()).slice(0, 800);
  } catch {
    return undefined;
  }
}
