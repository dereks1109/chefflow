// Groq API client — OpenAI-compatible chat-completions over HTTPS.
//
// Used by the workflow-generation endpoint to route through Groq's LPU-
// hosted Kimi K2 instead of Workers AI Llama. Kimi K2 is a meaningfully
// stronger reasoner for the constraint-satisfaction shape of kitchen-
// workflow scheduling, AND Groq's sub-second latency keeps chef-
// perceived speed at or below Workers AI's.
//
// All OTHER LLM endpoints (generate, analyze, photo) still go through
// runAi → Workers AI per the existing dispatch in endpoints.ts.
//
// Fallback: when GROQ_API_KEY is unset OR the Groq call fails, the
// caller falls back to Workers AI so a missing secret never breaks
// the workflow feature.

import type { ProxyRequestBody } from './types';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** Kimi K2 Instruct — currently the best open-weights reasoner Groq
 *  hosts (1T params, MoE, 128K context, JSON mode). Switch model id
 *  here to upgrade without touching call sites. */
export const GROQ_WORKFLOW_MODEL = 'moonshotai/kimi-k2-instruct';

export class GroqError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GroqError';
    this.status = status;
  }
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqChoice {
  message?: { content?: string };
}

interface GroqResponse {
  choices?: GroqChoice[];
}

export async function runGroq(
  apiKey: string,
  modelId: string,
  body: ProxyRequestBody,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const messages: GroqMessage[] = [{ role: 'system', content: body.systemPrompt }];
  if (typeof body.userPrompt === 'string' && body.userPrompt.length > 0) {
    messages.push({ role: 'user', content: body.userPrompt });
  } else if (typeof body.userContent === 'string' && body.userContent.length > 0) {
    messages.push({ role: 'user', content: body.userContent });
  }

  const payload: Record<string, unknown> = {
    model: modelId,
    messages,
    temperature: 0.4,
  };
  // Groq's JSON mode mirrors OpenAI's: response_format: { type: 'json_object' }.
  // Required when the SPA scheduler expects parseable JSON (it will retry +
  // strip ```json fences as a belt-and-braces backstop, but native JSON
  // mode is far more reliable).
  if (body.jsonMode !== false) {
    payload.response_format = { type: 'json_object' };
  }

  const res = await fetchImpl(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GroqError(`Groq ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  const data = (await res.json()) as GroqResponse;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new GroqError('Groq response missing choices[0].message.content');
  }
  return content;
}
