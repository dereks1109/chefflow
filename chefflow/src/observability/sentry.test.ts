import { describe, it, expect } from 'vitest';
import { scrubEvent, scrubBreadcrumb } from './sentry';

describe('scrubEvent', () => {
  it('strips request.data for /api/sync/* URLs', () => {
    const event = scrubEvent({
      request: { url: 'https://chefflow.app/api/sync/push', data: { secret: 'leak' } },
    });
    expect(event.request?.data).toBeUndefined();
  });

  it('strips request.data for /api/account URLs', () => {
    const event = scrubEvent({
      request: { url: 'https://chefflow.app/api/account', data: { id: 'u1' } },
    });
    expect(event.request?.data).toBeUndefined();
  });

  it('strips request.data for /api/llm/* URLs', () => {
    const event = scrubEvent({
      request: { url: 'https://chefflow.app/api/llm/workflow', data: { systemPrompt: 'x' } },
    });
    expect(event.request?.data).toBeUndefined();
  });

  it('keeps request.data for non-sensitive URLs', () => {
    const event = scrubEvent({
      request: { url: 'https://chefflow.app/api/health', data: { ok: true } },
    });
    expect(event.request?.data).toEqual({ ok: true });
  });

  it('drops extra.body / extra.payload / extra.request', () => {
    const event = scrubEvent({
      extra: { body: 'leak', payload: 'leak', request: 'leak', context: 'keep' },
    });
    expect(event.extra).toEqual({ context: 'keep' });
  });

  it('survives an event with no request and no extra', () => {
    const event = scrubEvent({});
    expect(event).toEqual({});
  });
});

describe('scrubBreadcrumb', () => {
  it('drops ui.input breadcrumbs (form values)', () => {
    expect(scrubBreadcrumb({ category: 'ui.input' })).toBeNull();
  });

  it('drops console breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console' })).toBeNull();
  });

  it('strips body + input from fetch breadcrumbs on sensitive URLs', () => {
    const out = scrubBreadcrumb({
      category: 'fetch',
      data: {
        url: 'https://chefflow.app/api/llm/generate',
        body: 'recipe text',
        input: 'recipe text',
        method: 'POST',
        status_code: 500,
      },
    });
    expect(out?.data?.body).toBeUndefined();
    expect(out?.data?.input).toBeUndefined();
    expect(out?.data?.method).toBe('POST');
    expect(out?.data?.status_code).toBe(500);
  });

  it('keeps body on fetch breadcrumbs to non-sensitive URLs', () => {
    const out = scrubBreadcrumb({
      category: 'fetch',
      data: { url: 'https://chefflow.app/api/health', body: 'ok', method: 'GET' },
    });
    expect(out?.data?.body).toBe('ok');
  });

  it('keeps non-fetch / non-input breadcrumbs untouched', () => {
    const nav = { category: 'navigation', data: { from: '/a', to: '/b' } };
    expect(scrubBreadcrumb(nav)).toEqual(nav);
  });
});
