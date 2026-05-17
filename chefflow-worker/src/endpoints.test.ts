import { describe, it, expect, vi } from 'vitest';
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

  it('uses TEXT_MODEL for workflow', async () => {
    const captured: { model?: string } = {};
    await handleEndpoint('workflow', fakeAi(captured), {
      systemPrompt: 'SYS',
      userPrompt: 'an event',
    });
    expect(captured.model).toBe(TEXT_MODEL);
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
