import { describe, it, expect, vi } from 'vitest';

// Mock groqClient before importing endpoints so handleEndpoint sees the
// mocked runGroq when the workflow path tries to use it.
const runGroqMock = vi.hoisted(() => vi.fn(async () => '{"groq":"ok"}'));
vi.mock('./groqClient', () => ({
  runGroq: runGroqMock,
  GROQ_WORKFLOW_MODEL: 'moonshotai/kimi-k2-instruct',
  GroqError: class extends Error {
    readonly status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
}));

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

  it('workflow + GROQ_API_KEY → routes to Groq + Kimi K2 (NOT Workers AI)', async () => {
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
    expect(callArgs[1]).toBe('moonshotai/kimi-k2-instruct');
    // Workers AI was NOT called.
    expect(captured.model).toBeUndefined();
  });

  it('workflow + Groq throws → falls back to Workers AI Llama (chef still gets a schedule)', async () => {
    runGroqMock.mockClear();
    runGroqMock.mockRejectedValueOnce(new Error('Groq 503: upstream busy'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const captured: { model?: string } = {};
      const out = await handleEndpoint(
        'workflow',
        fakeAi(captured),
        { systemPrompt: 'SYS', userPrompt: 'an event' },
        'gsk_test',
      );
      expect(out).toBe('{"ok":true}');
      expect(captured.model).toBe(TEXT_MODEL);
      expect(runGroqMock).toHaveBeenCalledTimes(1);
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
