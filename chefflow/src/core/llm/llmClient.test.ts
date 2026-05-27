import { describe, it, expect, vi, beforeEach } from 'vitest';

const callGroq = vi.fn(async (_arg: unknown) => 'groq-response');
const callProxy = vi.fn(async (_arg: unknown) => 'proxy-response');

// Mock the proxy module — note we MUST re-export ProxyClientError because
// llmClient imports it directly (post-2026-05-27, for quota detection).
class MockProxyClientError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly upstreamBody?: string;
  constructor(message: string, status: number, opts?: { retryAfterSeconds?: number; upstreamBody?: string }) {
    super(message);
    this.name = 'ProxyClientError';
    this.status = status;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
    this.upstreamBody = opts?.upstreamBody;
  }
}

vi.mock('../scheduler/llm/groqClient', () => ({
  complete: (arg: unknown) => callGroq(arg),
}));
vi.mock('./proxyClient', () => ({
  proxyComplete: (arg: unknown) => callProxy(arg),
  ProxyClientError: MockProxyClientError,
}));

beforeEach(() => {
  callGroq.mockClear();
  callProxy.mockClear();
  vi.resetModules();
});

async function withMode(mode: 'proxy' | 'groq' | undefined, fn: () => Promise<void>) {
  const prev = import.meta.env.VITE_LLM_MODE;
  (import.meta.env as Record<string, unknown>).VITE_LLM_MODE = mode;
  try { await fn(); } finally {
    (import.meta.env as Record<string, unknown>).VITE_LLM_MODE = prev;
  }
}

describe('llmClient.complete', () => {
  it('uses the proxy when VITE_LLM_MODE=proxy', async () => {
    await withMode('proxy', async () => {
      const { complete } = await import('./llmClient');
      const out = await complete({
        endpoint: 'generate',
        systemPrompt: 'S',
        userPrompt: 'U',
        apiKey: 'unused',
        model: 'unused',
      });
      expect(out).toBe('proxy-response');
      expect(callProxy).toHaveBeenCalledTimes(1);
      expect(callGroq).not.toHaveBeenCalled();
    });
  });

  it('uses Groq direct when VITE_LLM_MODE=groq', async () => {
    await withMode('groq', async () => {
      const { complete } = await import('./llmClient');
      const out = await complete({
        endpoint: 'generate',
        systemPrompt: 'S',
        userPrompt: 'U',
        apiKey: 'k',
        model: 'm',
      });
      expect(out).toBe('groq-response');
      expect(callGroq).toHaveBeenCalledTimes(1);
      expect(callProxy).not.toHaveBeenCalled();
    });
  });

  it('translates a proxy 429 with kind:"llm" into LlmDailyQuotaExceededError', async () => {
    await withMode('proxy', async () => {
      const { complete, LlmDailyQuotaExceededError } = await import('./llmClient');
      callProxy.mockRejectedValueOnce(
        new MockProxyClientError('Proxy 429', 429, {
          retryAfterSeconds: 1234,
          upstreamBody: JSON.stringify({ error: 'Daily quota exceeded for llm', kind: 'llm' }),
        }),
      );
      const promise = complete({
        endpoint: 'generate', systemPrompt: 'S', userPrompt: 'U', apiKey: 'unused', model: 'unused',
      });
      await expect(promise).rejects.toBeInstanceOf(LlmDailyQuotaExceededError);
      // Re-fire to assert retryAfterSeconds round-trips (mockRejectedValueOnce consumed above).
      callProxy.mockRejectedValueOnce(
        new MockProxyClientError('Proxy 429', 429, {
          retryAfterSeconds: 9000,
          upstreamBody: JSON.stringify({ kind: 'llm' }),
        }),
      );
      const p2 = complete({ endpoint: 'generate', systemPrompt: 'S', apiKey: '', model: '' });
      await expect(p2).rejects.toMatchObject({ retryAfterSeconds: 9000 });
    });
  });

  it('passes through 429s that are NOT the LLM quota shape (e.g. Groq upstream rate limit returned from the proxy)', async () => {
    await withMode('proxy', async () => {
      const { complete, LlmDailyQuotaExceededError } = await import('./llmClient');
      callProxy.mockRejectedValueOnce(
        new MockProxyClientError('Proxy 429', 429, {
          upstreamBody: JSON.stringify({ error: 'Groq rate-limit', upstream: 'groq' }),
        }),
      );
      const p = complete({ endpoint: 'generate', systemPrompt: 'S', apiKey: '', model: '' });
      await expect(p).rejects.not.toBeInstanceOf(LlmDailyQuotaExceededError);
      await expect(p).rejects.toBeInstanceOf(MockProxyClientError);
    });
  });

  it('passes through non-429 errors unchanged', async () => {
    await withMode('proxy', async () => {
      const { complete, LlmDailyQuotaExceededError } = await import('./llmClient');
      callProxy.mockRejectedValueOnce(new MockProxyClientError('Server error', 500));
      const p = complete({ endpoint: 'generate', systemPrompt: 'S', apiKey: '', model: '' });
      await expect(p).rejects.not.toBeInstanceOf(LlmDailyQuotaExceededError);
      await expect(p).rejects.toMatchObject({ status: 500 });
    });
  });

  it('does NOT translate Groq-mode 429s (BYO-key rate limits are not our quota)', async () => {
    await withMode('groq', async () => {
      const { complete, LlmDailyQuotaExceededError } = await import('./llmClient');
      const err = new Error('Groq 429');
      callGroq.mockRejectedValueOnce(err);
      const p = complete({ endpoint: 'generate', systemPrompt: 'S', apiKey: 'k', model: 'm' });
      await expect(p).rejects.not.toBeInstanceOf(LlmDailyQuotaExceededError);
      await expect(p).rejects.toBe(err);
    });
  });
});
