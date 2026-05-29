import { describe, it, expect, vi } from 'vitest';
import { runGroq, GROQ_WORKFLOW_MODEL, GroqError } from './groqClient';
import type { ProxyRequestBody } from './types';

function okResponse(content = '{"ok":true}'): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('runGroq', () => {
  it('POSTs an OpenAI-compatible chat-completions body + returns choices[0].message.content', async () => {
    let postedUrl: string | undefined;
    let postedHeaders: Record<string, string> = {};
    let postedBody: unknown;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      postedUrl = url;
      postedHeaders = (init?.headers ?? {}) as Record<string, string>;
      postedBody = init?.body;
      return okResponse('{"items":[]}');
    });
    const body: ProxyRequestBody = {
      systemPrompt: 'You are a kitchen-workflow planner.',
      userPrompt: 'Plan the prep for steak frites.',
    };

    const out = await runGroq('gsk_test', GROQ_WORKFLOW_MODEL, body, fetchImpl as unknown as typeof fetch);

    expect(out).toBe('{"items":[]}');
    expect(postedUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(postedHeaders['Authorization']).toBe('Bearer gsk_test');
    const parsed = JSON.parse(postedBody as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format?: { type: string };
    };
    expect(parsed.model).toBe('moonshotai/kimi-k2-instruct');
    expect(parsed.messages[0].role).toBe('system');
    expect(parsed.messages[1].role).toBe('user');
    expect(parsed.messages[1].content).toContain('steak frites');
    // JSON mode is on by default (the SPA scheduler expects parseable JSON).
    expect(parsed.response_format?.type).toBe('json_object');
  });

  it('omits response_format when jsonMode=false (e.g. plain-text descriptions)', async () => {
    let postedBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      postedBody = init?.body;
      return okResponse('hello');
    });
    await runGroq(
      'gsk_x',
      GROQ_WORKFLOW_MODEL,
      { systemPrompt: 'S', userPrompt: 'U', jsonMode: false },
      fetchImpl as unknown as typeof fetch,
    );
    const parsed = JSON.parse(postedBody as string) as { response_format?: { type: string } };
    expect(parsed.response_format).toBeUndefined();
  });

  it('throws GroqError with the upstream status on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }));
    try {
      await runGroq('gsk_x', GROQ_WORKFLOW_MODEL, { systemPrompt: 'S' }, fetchImpl as unknown as typeof fetch);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GroqError);
      expect((err as GroqError).status).toBe(429);
    }
  });

  it('throws when the response body has no choices[0].message.content', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );
    await expect(
      runGroq('gsk_x', GROQ_WORKFLOW_MODEL, { systemPrompt: 'S' }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/missing choices/);
  });
});
