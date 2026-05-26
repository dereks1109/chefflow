import { describe, it, expect, vi } from 'vitest';
import { setAdminByEmail, AdminBootstrapError } from './setAdminByEmail';

function makeFetch(steps: Array<{ url: RegExp; method?: string; status: number; body: unknown }>): {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const step = steps[i++];
    if (!step) throw new Error(`unexpected fetch call ${i} to ${url}`);
    expect(url).toMatch(step.url);
    if (step.method) expect(init?.method ?? 'GET').toBe(step.method);
    return new Response(
      typeof step.body === 'string' ? step.body : JSON.stringify(step.body),
      { status: step.status },
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('setAdminByEmail', () => {
  it('throws 400 when email is missing or malformed', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      setAdminByEmail('', 'sk_test', fetchImpl),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      setAdminByEmail('not-an-email', 'sk_test', fetchImpl),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws 404 when no Clerk user matches the email', async () => {
    const { fetchImpl } = makeFetch([
      { url: /\/v1\/users\?email_address=/, status: 200, body: [] },
    ]);
    await expect(
      setAdminByEmail('ghost@chefflow.uk', 'sk_test', fetchImpl),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('promotes the target + demotes existing admins (replace semantics)', async () => {
    // 1) lookup target by email → returns user_target
    // 2) list users page 1 → contains user_oldAdmin (role=admin) + user_target (role=admin already, ignored in demote)
    // 3) list users page 2 → empty (terminate pagination)
    // 4) PATCH /users/user_oldAdmin/metadata role:null (demote)
    // 5) PATCH /users/user_target/metadata role:'admin' (promote)
    const { fetchImpl, calls } = makeFetch([
      {
        url: /\/v1\/users\?email_address=admin%40chefflow\.uk/,
        status: 200,
        body: [{ id: 'user_target', public_metadata: {} }],
      },
      {
        url: /\/v1\/users\?limit=100&offset=0/,
        status: 200,
        body: [
          { id: 'user_oldAdmin', public_metadata: { role: 'admin' } },
          { id: 'user_target', public_metadata: { role: 'admin' } },
        ],
      },
      {
        url: /\/v1\/users\/user_oldAdmin\/metadata/,
        method: 'PATCH',
        status: 200,
        body: {},
      },
      {
        url: /\/v1\/users\/user_target\/metadata/,
        method: 'PATCH',
        status: 200,
        body: {},
      },
    ]);

    const result = await setAdminByEmail('admin@chefflow.uk', 'sk_test', fetchImpl);
    expect(result.promotedUserId).toBe('user_target');
    expect(result.demotedUserIds).toEqual(['user_oldAdmin']);

    // Demote call sent role:null.
    const demote = JSON.parse(calls[2].init?.body as string);
    expect(demote.public_metadata.role).toBeNull();
    // Promote call sent role:'admin'.
    const promote = JSON.parse(calls[3].init?.body as string);
    expect(promote.public_metadata.role).toBe('admin');
  });

  it('skips demote step when no existing admins exist', async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        url: /\/v1\/users\?email_address=/,
        status: 200,
        body: [{ id: 'user_target', public_metadata: {} }],
      },
      {
        url: /\/v1\/users\?limit=100/,
        status: 200,
        body: [{ id: 'user_target', public_metadata: {} }],
      },
      {
        url: /\/v1\/users\/user_target\/metadata/,
        method: 'PATCH',
        status: 200,
        body: {},
      },
    ]);
    const result = await setAdminByEmail('admin@chefflow.uk', 'sk_test', fetchImpl);
    expect(result.demotedUserIds).toEqual([]);
    expect(result.promotedUserId).toBe('user_target');
    // Only 3 calls: lookup, list (1 page), promote.
    expect(calls).toHaveLength(3);
  });

  it('throws AdminBootstrapError with the HTTP status when Clerk PATCH fails', async () => {
    const { fetchImpl } = makeFetch([
      {
        url: /\/v1\/users\?email_address=/,
        status: 200,
        body: [{ id: 'user_target', public_metadata: {} }],
      },
      { url: /\/v1\/users\?limit=100/, status: 200, body: [] },
      { url: /\/v1\/users\/user_target\/metadata/, method: 'PATCH', status: 403, body: 'forbidden' },
    ]);
    await expect(
      setAdminByEmail('admin@chefflow.uk', 'sk_test', fetchImpl),
    ).rejects.toBeInstanceOf(AdminBootstrapError);
  });
});
