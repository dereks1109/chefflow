import { describe, it, expect, vi, afterEach } from 'vitest';
import { proxyComplete } from './proxyClient';

afterEach(() => {
  delete (window as unknown as { Clerk?: unknown }).Clerk;
});

function setupClerk(token: string | null) {
  (window as unknown as { Clerk: unknown }).Clerk = {
    session: token ? { getToken: vi.fn(async () => token) } : null,
  };
}

function fetchReturning(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
  ) as unknown as typeof fetch;
}

describe('proxyComplete', () => {
  it('POSTs to /api/llm/<endpoint> with the Bearer JWT and JSON body', async () => {
    setupClerk('jwt.test.token');
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ content: '{"ok":true}' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const out = await proxyComplete({
      endpoint: 'generate',
      systemPrompt: 'SYS',
      userPrompt: 'USR',
      fetchImpl,
    });
    expect(out).toBe('{"ok":true}');
    expect(capturedUrl).toBe('/api/llm/generate');
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer jwt.test.token');
    const body = JSON.parse(capturedInit?.body as string);
    expect(body).toEqual({ systemPrompt: 'SYS', userPrompt: 'USR' });
  });

  it('throws ProxyClientError 401 when Clerk has no session', async () => {
    setupClerk(null);
    await expect(
      proxyComplete({ endpoint: 'generate', systemPrompt: 'S', userPrompt: 'U', fetchImpl: fetchReturning(200, {}) }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws ProxyClientError with the HTTP status and Retry-After on 429', async () => {
    setupClerk('jwt.test.token');
    await expect(
      proxyComplete({
        endpoint: 'generate', systemPrompt: 'S', userPrompt: 'U',
        fetchImpl: fetchReturning(429, { error: 'Daily quota exceeded' }, { 'Retry-After': '3600' }),
      }),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 3600 });
  });

  it('respects userContent (multimodal) over userPrompt when both are passed', async () => {
    setupClerk('jwt.test.token');
    let capturedBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ content: '{}' }), { status: 200 });
    }) as unknown as typeof fetch;
    await proxyComplete({
      endpoint: 'photo',
      systemPrompt: 'SYS',
      userContent: [{ type: 'text', text: 'X' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,A' } }],
      fetchImpl,
    });
    expect(capturedBody).toEqual({
      systemPrompt: 'SYS',
      userContent: [
        { type: 'text', text: 'X' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,A' } },
      ],
    });
  });
});
