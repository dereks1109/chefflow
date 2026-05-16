import { describe, it, expect, vi } from 'vitest';
import { complete, GroqClientError } from './groqClient';

function mockFetch(responder: () => Promise<Response>): typeof fetch {
  return vi.fn(responder) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('groqClient.complete', () => {
  it('rejects when no API key is provided', async () => {
    await expect(
      complete({
        apiKey: '',
        model: 'llama-3.3-70b-versatile',
        systemPrompt: 's',
        userPrompt: 'u',
        fetchImpl: mockFetch(() => Promise.resolve(jsonResponse({}))),
      }),
    ).rejects.toThrow(/Missing API key/);
  });

  it('sends a well-formed POST to /chat/completions with bearer auth + JSON body', async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    const fetchImpl = mockFetch((..._args: unknown[]) => {
      const [url, init] = _args as [string, RequestInit];
      captured = { url, init };
      return Promise.resolve(jsonResponse({
        choices: [{ message: { content: '{"steps":[]}' } }],
      }));
    });

    const out = await complete({
      apiKey: 'gsk_test_key',
      model: 'llama-3.3-70b-versatile',
      systemPrompt: 'SYS',
      userPrompt: 'USR',
      fetchImpl,
    });

    expect(out).toBe('{"steps":[]}');
    expect(captured.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(captured.init?.method).toBe('POST');
    expect((captured.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer gsk_test_key');
    expect((captured.init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = JSON.parse(captured.init?.body as string);
    expect(body.model).toBe('llama-3.3-70b-versatile');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.temperature).toBe(0);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'USR' });
  });

  it('honors a custom baseUrl (for Ollama / OpenRouter swap)', async () => {
    let captured = '';
    const fetchImpl = mockFetch((..._args: unknown[]) => {
      captured = _args[0] as string;
      return Promise.resolve(jsonResponse({ choices: [{ message: { content: '{}' } }] }));
    });
    await complete({
      apiKey: 'k',
      model: 'm',
      systemPrompt: 's',
      userPrompt: 'u',
      fetchImpl,
      baseUrl: 'http://localhost:11434/v1',
    });
    expect(captured).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('throws GroqClientError with status on a non-OK response', async () => {
    const fetchImpl = mockFetch(() =>
      Promise.resolve(new Response('rate limit hit', { status: 429, statusText: 'Too Many Requests' })),
    );
    try {
      await complete({
        apiKey: 'k',
        model: 'm',
        systemPrompt: 's',
        userPrompt: 'u',
        fetchImpl,
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GroqClientError);
      expect((err as GroqClientError).status).toBe(429);
      expect((err as GroqClientError).upstreamBody).toContain('rate limit');
    }
  });

  it('throws on a network error', async () => {
    const fetchImpl = mockFetch(() => Promise.reject(new Error('ECONNREFUSED')));
    await expect(
      complete({ apiKey: 'k', model: 'm', systemPrompt: 's', userPrompt: 'u', fetchImpl }),
    ).rejects.toThrow(/Network error: ECONNREFUSED/);
  });

  it('throws when the response has no content', async () => {
    const fetchImpl = mockFetch(() => Promise.resolve(jsonResponse({ choices: [] })));
    await expect(
      complete({ apiKey: 'k', model: 'm', systemPrompt: 's', userPrompt: 'u', fetchImpl }),
    ).rejects.toThrow(/no content/);
  });

  it('sends multimodal user content verbatim when userContent is an array', async () => {
    let captured: { init?: RequestInit } = {};
    const fetchImpl = mockFetch((..._args: unknown[]) => {
      const [, init] = _args as [string, RequestInit];
      captured = { init };
      return Promise.resolve(jsonResponse({
        choices: [{ message: { content: '{"title":"x"}' } }],
      }));
    });

    await complete({
      apiKey: 'k',
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      systemPrompt: 'SYS',
      userContent: [
        { type: 'text', text: 'Describe this recipe.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      ],
      fetchImpl,
    });

    const body = JSON.parse(captured.init?.body as string);
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'Describe this recipe.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ]);
  });

  it('honors responseFormat=text (vision models that may not support JSON mode)', async () => {
    let captured: { init?: RequestInit } = {};
    const fetchImpl = mockFetch((..._args: unknown[]) => {
      const [, init] = _args as [string, RequestInit];
      captured = { init };
      return Promise.resolve(jsonResponse({ choices: [{ message: { content: '{}' } }] }));
    });
    await complete({
      apiKey: 'k',
      model: 'm',
      systemPrompt: 's',
      userPrompt: 'u',
      responseFormat: 'text',
      fetchImpl,
    });
    const body = JSON.parse(captured.init?.body as string);
    expect(body.response_format).toEqual({ type: 'text' });
  });
});
