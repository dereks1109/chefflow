import { describe, it, expect, vi } from 'vitest';
import { verifyClerkRequest, UnauthorizedError } from './auth';

const fakeEnv = {
  CLERK_ISSUER: 'https://example.clerk.accounts.dev',
  CLERK_JWT_KEY: '-----BEGIN PUBLIC KEY-----\nFAKE\n-----END PUBLIC KEY-----',
} as { CLERK_ISSUER: string; CLERK_JWT_KEY: string };

describe('verifyClerkRequest', () => {
  it('throws UnauthorizedError when the Authorization header is missing', async () => {
    const req = new Request('https://api.test/llm/generate', { method: 'POST' });
    await expect(verifyClerkRequest(req, fakeEnv)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws UnauthorizedError when the header is not Bearer-shaped', async () => {
    const req = new Request('https://api.test/llm/generate', {
      method: 'POST',
      headers: { Authorization: 'Basic abc' },
    });
    await expect(verifyClerkRequest(req, fakeEnv)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('returns the userId when Clerk verifies the token', async () => {
    const stubVerify = vi.fn(async () => ({ sub: 'user_abc123' }));
    const req = new Request('https://api.test/llm/generate', {
      method: 'POST',
      headers: { Authorization: 'Bearer good.jwt.token' },
    });
    const userId = await verifyClerkRequest(req, fakeEnv, stubVerify);
    expect(userId).toBe('user_abc123');
    expect(stubVerify).toHaveBeenCalledWith('good.jwt.token', {
      jwtKey: fakeEnv.CLERK_JWT_KEY,
      issuer: fakeEnv.CLERK_ISSUER,
    });
  });

  it('throws UnauthorizedError when the verifier rejects the token', async () => {
    const stubVerify = vi.fn(async () => { throw new Error('exp claim is expired'); });
    const req = new Request('https://api.test/llm/generate', {
      method: 'POST',
      headers: { Authorization: 'Bearer bad.jwt.token' },
    });
    await expect(verifyClerkRequest(req, fakeEnv, stubVerify)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
