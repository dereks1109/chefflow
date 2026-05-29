import { describe, it, expect, vi } from 'vitest';

// Mock groqClient before importing endpoints. We mock the low-level
// runGroq so we can assert which model the tri-tier fallback chain
// chose (Llama primary → Kimi K2 fallback → outer Workers AI). The
// real runGroqWithFallback delegates to runGroq twice with the two
// model constants, so we mirror that behaviour here to exercise the
// fallback chain end-to-end.
const runGroqMock = vi.hoisted(() => vi.fn(async () => '{"groq":"ok"}'));
vi.mock('./groqClient', () => {
  const PRIMARY = 'llama-3.3-70b-versatile';
  const FALLBACK = 'moonshotai/kimi-k2-instruct';
  return {
    runGroq: runGroqMock,
    GROQ_WORKFLOW_MODEL: PRIMARY,
    GROQ_WORKFLOW_FALLBACK_MODEL: FALLBACK,
    runGroqWithFallback: async (apiKey: string, body: unknown) => {
      try {
        return await runGroqMock(apiKey, PRIMARY, body);
      } catch {
        return runGroqMock(apiKey, FALLBACK, body);
      }
    },
    GroqError: class extends Error {
      readonly status?: number;
      constructor(message: string, status?: number) {
        super(message);
        this.status = status;
      }
    },
  };
});

import { handleEndpoint } from './endpoints';
import { TEXT_MODEL, VISION_MODEL } from './types';

function fakeAi(captured: { model?: string }) {
  return {
    run: vi.fn(async (model: string) => {
      captured.model = model;
      return { response: '{"ok":true}' };
    }),
  } as unknown as Ai;
}

describe('handleEndpoint', () => {
  it('uses TEXT_MODEL for generate', async () => {
    const captured: { model?: string } = {};
    const out = await handleEndpoint('generate', fakeAi(captured), {
      systemPrompt: 'SYS',
      userPrompt: 'a dish',
    });
    expect(captured.model).toBe(TEXT_MODEL);
    expect(out).toBe('{"ok":true}');
  });

  it('uses TEXT_MODEL for analyze', async () => {
    const captured: { model?: string } = {};
    await handleEndpoint('analyze', fakeAi(captured), {
      systemPrompt: 'SYS',
      userPrompt: 'a recipe',
    });
    expect(captured.model).toBe(TEXT_MODEL);
  });

  it('workflow + NO GROQ_API_KEY → falls through to Workers AI Llama (TEXT_MODEL)', async () => {
    runGroqMock.mockClear();
    const captured: { model?: string } = {};
    await handleEndpoint('workflow', fakeAi(captured), {
      systemPrompt: 'SYS',
      userPrompt: 'an event',
    });
    expect(captured.model).toBe(TEXT_MODEL);
    expect(runGroqMock).not.toHaveBeenCalled();
  });

  it('workflow + GROQ_API_KEY → routes to Groq + Llama 3.3 70B (fast primary, NOT Workers AI)', async () => {
    runGroqMock.mockClear();
    runGroqMock.mockResolvedValueOnce('{"groq":"ok"}');
    const captured: { model?: string } = {};
    const out = await handleEndpoint(
      'workflow',
      fakeAi(captured),
      { systemPrompt: 'SYS', userPrompt: 'an event' },
      'gsk_test',
    );
    expect(out).toBe('{"groq":"ok"}');
    expect(runGroqMock).toHaveBeenCalledTimes(1);
    const callArgs = runGroqMock.mock.calls[0] as unknown as unknown[];
    expect(callArgs[0]).toBe('gsk_test');
    // Primary tier: Llama 3.3 70B (~500ms TTFT), NOT Kimi K2.
    expect(callArgs[1]).toBe('llama-3.3-70b-versatile');
    // Workers AI was NOT called.
    expect(captured.model).toBeUndefined();
  });

  it('workflow + Llama errors → falls back to Kimi K2 (smart tier 2 inside runGroqWithFallback)', async () => {
    runGroqMock.mockClear();
    runGroqMock.mockRejectedValueOnce(new Error('Groq 503: Llama overloaded'));
    runGroqMock.mockResolvedValueOnce('{"kimi":"resolved"}');
    const captured: { model?: string } = {};
    const out = await handleEndpoint(
      'workflow',
      fakeAi(captured),
      { systemPrompt: 'SYS', userPrompt: 'an event' },
      'gsk_test',
    );
    // Kimi K2 returned the workflow — chef never noticed the Llama dropout.
    expect(out).toBe('{"kimi":"resolved"}');
    expect(runGroqMock).toHaveBeenCalledTimes(2);
    expect(runGroqMock.mock.calls[0][1]).toBe('llama-3.3-70b-versatile');
    expect(runGroqMock.mock.calls[1][1]).toBe('moonshotai/kimi-k2-instruct');
    // Outer Workers AI fallback was NOT triggered (Groq tier 2 succeeded).
    expect(captured.model).toBeUndefined();
  });

  it('workflow + BOTH Groq tiers throw → outer fallback to Workers AI Llama (chef still gets a schedule)', async () => {
    runGroqMock.mockClear();
    runGroqMock.mockRejectedValueOnce(new Error('Groq 503: Llama down'));
    runGroqMock.mockRejectedValueOnce(new Error('Groq 503: Kimi down too'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const captured: { model?: string } = {};
      const out = await handleEndpoint(
        'workflow',
        fakeAi(captured),
        { systemPrompt: 'SYS', userPrompt: 'an event' },
        'gsk_test',
      );
      // Final tier: Workers AI Llama returned the schedule.
      expect(out).toBe('{"ok":true}');
      expect(captured.model).toBe(TEXT_MODEL);
      // Both Groq tiers were attempted before the outer fallback fired.
      expect(runGroqMock).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it('uses VISION_MODEL for photo and defaults jsonMode to false', async () => {
    const captured: { model?: string } = {};
    await handleEndpoint('photo', fakeAi(captured), {
      systemPrompt: 'SYS',
      userContent: [
        { type: 'text', text: 'OCR this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,A' } },
      ],
    });
    expect(captured.model).toBe(VISION_MODEL);
  });

  it('throws on an unknown endpoint name', async () => {
    const captured: { model?: string } = {};
    await expect(
      handleEndpoint('explode' as 'generate', fakeAi(captured), {
        systemPrompt: 'SYS', userPrompt: 'x',
      }),
    ).rejects.toThrow(/Unknown endpoint/);
  });
});
