import { describe, it, expect, vi } from 'vitest';
import { runAi } from './aiCall';
import type { ProxyRequestBody } from './types';

function fakeAi(captured: { model?: string; payload?: unknown }) {
  return {
    run: vi.fn(async (model: string, payload: unknown) => {
      captured.model = model;
      captured.payload = payload;
      return { response: '{"title":"x"}' };
    }),
  } as unknown as Ai;
}

describe('runAi', () => {
  it('sends a text-only chat completion in JSON mode by default', async () => {
    const captured: { model?: string; payload?: unknown } = {};
    const body: ProxyRequestBody = {
      systemPrompt: 'SYS',
      userPrompt: 'USR',
    };
    const out = await runAi(fakeAi(captured), 'text-model', body);
    expect(out).toBe('{"title":"x"}');
    const p = captured.payload as {
      messages: Array<{ role: string; content: unknown }>;
      response_format: { type: string };
    };
    expect(captured.model).toBe('text-model');
    expect(p.messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'USR' },
    ]);
    expect(p.response_format).toEqual({ type: 'json_object' });
  });

  it('sends multimodal user content verbatim when userContent is an array', async () => {
    const captured: { model?: string; payload?: unknown } = {};
    const body: ProxyRequestBody = {
      systemPrompt: 'SYS',
      userContent: [
        { type: 'text', text: 'Describe' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      ],
      jsonMode: false,
    };
    await runAi(fakeAi(captured), 'vision-model', body);
    const p = captured.payload as {
      messages: Array<{ role: string; content: unknown }>;
      response_format: { type: string };
    };
    expect(p.messages[1].content).toEqual(body.userContent);
    expect(p.response_format).toEqual({ type: 'text' });
  });

  it('throws when neither userPrompt nor userContent is provided', async () => {
    const captured: { model?: string; payload?: unknown } = {};
    await expect(runAi(fakeAi(captured), 'm', { systemPrompt: 'SYS' }))
      .rejects.toThrow(/userPrompt or userContent/);
  });

  it('throws when the AI response is empty', async () => {
    const ai = {
      run: vi.fn(async () => ({ response: '' })),
    } as unknown as Ai;
    await expect(runAi(ai, 'm', { systemPrompt: 'SYS', userPrompt: 'USR' }))
      .rejects.toThrow(/empty AI response/i);
  });
});
