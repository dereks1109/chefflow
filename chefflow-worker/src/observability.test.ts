import { describe, it, expect } from 'vitest';
import { scrubWorkerEvent, newRequestId } from './observability';

describe('scrubWorkerEvent', () => {
  it('strips request.data on /api/sync/* URLs', () => {
    const event = scrubWorkerEvent({
      request: { url: 'https://w.example/api/sync/push', data: { secret: 'leak' } },
    });
    expect(event.request?.data).toBeUndefined();
  });

  it('strips request.data on /api/account URLs', () => {
    const event = scrubWorkerEvent({
      request: { url: 'https://w.example/api/account', data: { x: 1 } },
    });
    expect(event.request?.data).toBeUndefined();
  });

  it('strips request.data on /api/llm/* URLs', () => {
    const event = scrubWorkerEvent({
      request: { url: 'https://w.example/api/llm/workflow', data: { x: 1 } },
    });
    expect(event.request?.data).toBeUndefined();
  });

  it('preserves request.data on /api/health', () => {
    const event = scrubWorkerEvent({
      request: { url: 'https://w.example/api/health', data: { ok: true } },
    });
    expect(event.request?.data).toEqual({ ok: true });
  });

  it('survives an event without a request field', () => {
    const event = scrubWorkerEvent({});
    expect(event).toEqual({});
  });
});

describe('newRequestId', () => {
  it('returns a UUID v4-shaped string', () => {
    const id = newRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('returns distinct ids on each call', () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });
});
