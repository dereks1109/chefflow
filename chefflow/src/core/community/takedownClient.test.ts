import { describe, it, expect, vi } from 'vitest';
import { submitTakedownReport, listTakedownReports, resolveTakedownReport } from './takedownClient';

const baseOpts = { getToken: async () => 'jwt.test', origin: 'https://api.test' };

describe('takedownClient', () => {
  it('submitTakedownReport POSTs to /api/community/report with the form fields', async () => {
    let captured: { url: string; init: RequestInit | undefined } | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ id: 'tdr_1' }), { status: 200 });
    }) as unknown as typeof fetch;

    const out = await submitTakedownReport({
      ...baseOpts,
      fetchImpl,
      input: {
        communityRecipeId: 'cr_xyz',
        reasonCode: 'copyright',
        message: 'mine',
        reporterEmail: 'a@b',
      },
    });
    expect(out.id).toBe('tdr_1');
    expect(captured?.url).toBe('https://api.test/api/community/report');
    expect(captured?.init?.method).toBe('POST');
    expect(JSON.parse(captured?.init?.body as string)).toEqual({
      communityRecipeId: 'cr_xyz',
      reasonCode: 'copyright',
      message: 'mine',
      reporterEmail: 'a@b',
    });
  });

  it('submitTakedownReport throws when getToken returns null', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      submitTakedownReport({
        ...baseOpts,
        getToken: async () => null,
        fetchImpl,
        input: { communityRecipeId: 'x', reasonCode: 'copyright' },
      }),
    ).rejects.toThrow('Not signed in');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('listTakedownReports adds status + limit query params', async () => {
    let capturedUrl = '';
    const fetchImpl = vi.fn(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ reports: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await listTakedownReports({ ...baseOpts, fetchImpl, status: 'pending', limit: 25 });
    expect(capturedUrl).toContain('status=pending');
    expect(capturedUrl).toContain('limit=25');
  });

  it('resolveTakedownReport POSTs to /:id/resolve with action + note', async () => {
    let captured: { url: string; init: RequestInit | undefined } | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ status: 'resolved', unpublishedRecipeId: 'cr_xyz' }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await resolveTakedownReport({
      ...baseOpts,
      fetchImpl,
      reportId: 'tdr_1',
      action: 'unpublish',
      note: 'IP confirmed',
    });
    expect(out.status).toBe('resolved');
    expect(captured?.url).toBe('https://api.test/api/admin/takedown-reports/tdr_1/resolve');
    expect(JSON.parse(captured?.init?.body as string)).toEqual({ action: 'unpublish', note: 'IP confirmed' });
  });
});
