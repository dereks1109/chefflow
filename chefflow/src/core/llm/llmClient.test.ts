import { describe, it, expect, vi, beforeEach } from 'vitest';

const callGroq = vi.fn(async (_arg: unknown) => 'groq-response');
const callProxy = vi.fn(async (_arg: unknown) => 'proxy-response');

vi.mock('../scheduler/llm/groqClient', () => ({
  complete: (arg: unknown) => callGroq(arg),
}));
vi.mock('./proxyClient', () => ({
  proxyComplete: (arg: unknown) => callProxy(arg),
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
});
