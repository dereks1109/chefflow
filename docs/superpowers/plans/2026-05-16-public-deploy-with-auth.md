# Public Deploy with Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put ChefFlow on a public Cloudflare Pages URL with Clerk email/Google login, and move every LLM call through a Cloudflare Worker bound to Workers AI so no API key is reachable from the browser bundle.

**Architecture:** Three deployable pieces. (1) Existing `chefflow/` Vite SPA, gated by Clerk components, calls `/api/llm/*` on the same origin. (2) New `chefflow-worker/` Cloudflare Worker verifies Clerk JWTs, rate-limits per user in Workers KV, and forwards prompts to `env.AI.run(...)` — no API key anywhere. (3) Cloudflare Pages serves the SPA and routes `/api/llm/*` to the Worker. IndexedDB stays per-browser; v1 is "gate the demo", not cloud sync.

**Tech Stack:** TypeScript everywhere. Vite + React + Clerk SDK (`@clerk/clerk-react`) on the client. Cloudflare Workers + Workers AI binding + Workers KV + `@clerk/backend` on the server. Vitest + Miniflare for Worker tests; existing Vitest for SPA tests.

**Spec:** [docs/superpowers/specs/2026-05-16-public-deploy-with-auth-design.md](../specs/2026-05-16-public-deploy-with-auth-design.md)

**Phases:**
- **Phase A** (Tasks 1–8): Build the Worker — runs + tests in isolation via `wrangler dev`.
- **Phase B** (Tasks 9–17): Wire the SPA — Clerk gate + proxy client; works locally with `VITE_LLM_MODE=groq` fallback.
- **Phase C** (Tasks 18–22): Deploy + verify on Cloudflare.

---

## Phase A — Cloudflare Worker (`chefflow-worker/`)

### Task 1: Scaffold the Worker package

**Files:**
- Create: `chefflow-worker/package.json`
- Create: `chefflow-worker/tsconfig.json`
- Create: `chefflow-worker/wrangler.toml`
- Create: `chefflow-worker/vitest.config.ts`
- Create: `chefflow-worker/src/index.ts` (stub)
- Create: `chefflow-worker/.gitignore`
- Create: `chefflow-worker/README.md`

- [ ] **Step 1: Create the directory and package.json**

```bash
mkdir -p chefflow-worker/src
```

Write `chefflow-worker/package.json`:

```json
{
  "name": "chefflow-worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.8.0",
    "@cloudflare/workers-types": "^4.20260101.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.90.0"
  },
  "dependencies": {
    "@clerk/backend": "^1.20.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Write `chefflow-worker/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create wrangler.toml**

Write `chefflow-worker/wrangler.toml`:

```toml
name = "chefflow-llm-proxy"
main = "src/index.ts"
compatibility_date = "2026-01-15"

[ai]
binding = "AI"

# Placeholder KV id — replace via: wrangler kv:namespace create RATE_LIMIT (Task 18)
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "TODO_REPLACE_AFTER_NAMESPACE_CREATE"

[vars]
# Replace with your Clerk Frontend API URL (Task 18)
CLERK_ISSUER = "https://example.clerk.accounts.dev"
# Daily generations per user
DAILY_LIMIT = "30"
```

- [ ] **Step 4: Create vitest.config.ts**

Write `chefflow-worker/vitest.config.ts`:

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

- [ ] **Step 5: Stub index.ts so the package compiles**

Write `chefflow-worker/src/index.ts`:

```ts
export interface Env {
  AI: Ai;
  RATE_LIMIT: KVNamespace;
  CLERK_ISSUER: string;
  CLERK_JWT_KEY: string;
  DAILY_LIMIT: string;
}

export default {
  async fetch(_req: Request, _env: Env): Promise<Response> {
    return new Response('chefflow-llm-proxy', { status: 200 });
  },
};
```

- [ ] **Step 6: Create .gitignore and README**

Write `chefflow-worker/.gitignore`:

```
node_modules
dist
.wrangler
.dev.vars
*.log
```

Write `chefflow-worker/README.md`:

```markdown
# chefflow-llm-proxy

Cloudflare Worker that proxies ChefFlow LLM calls. Verifies Clerk JWTs,
rate-limits per user in Workers KV, forwards prompts to Workers AI.

Deploy steps live in [docs/superpowers/plans/2026-05-16-public-deploy-with-auth.md](../docs/superpowers/plans/2026-05-16-public-deploy-with-auth.md) (Tasks 18–22).
```

- [ ] **Step 7: Install dependencies**

Run from `chefflow-worker/`:

```bash
cd chefflow-worker && npm install
```

Expected: success, `node_modules/` created.

- [ ] **Step 8: Verify typecheck and stub server compile**

```bash
cd chefflow-worker && npx tsc --noEmit
```

Expected: no output, exit 0.

- [ ] **Step 9: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow-worker/
git commit -m "feat(worker): scaffold chefflow-llm-proxy Cloudflare Worker

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Clerk JWT verification (TDD)

**Files:**
- Create: `chefflow-worker/src/auth.ts`
- Create: `chefflow-worker/src/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Write `chefflow-worker/src/auth.test.ts`:

```ts
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
    // Patch the verifier by injecting a stub via DI (second arg)
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
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd chefflow-worker && npx vitest run src/auth.test.ts
```

Expected: fail with "Cannot find module './auth'".

- [ ] **Step 3: Implement auth.ts**

Write `chefflow-worker/src/auth.ts`:

```ts
import { verifyToken } from '@clerk/backend';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

interface ClerkConfig {
  CLERK_ISSUER: string;
  CLERK_JWT_KEY: string;
}

// Injected verifier signature — matches Clerk's verifyToken so tests can stub.
type TokenVerifier = (
  token: string,
  opts: { jwtKey: string; issuer: string },
) => Promise<{ sub: string } | undefined>;

/**
 * Verify the request's Clerk JWT and return the authenticated userId.
 * Throws UnauthorizedError on any failure (missing header, bad shape,
 * bad signature, wrong issuer, expired token, missing sub claim).
 */
export async function verifyClerkRequest(
  req: Request,
  env: ClerkConfig,
  verify: TokenVerifier = verifyToken as unknown as TokenVerifier,
): Promise<string> {
  const header = req.headers.get('Authorization');
  if (!header) throw new UnauthorizedError('Missing Authorization header');
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) throw new UnauthorizedError('Authorization header must be Bearer-shaped');
  const token = match[1].trim();
  try {
    const claims = await verify(token, {
      jwtKey: env.CLERK_JWT_KEY,
      issuer: env.CLERK_ISSUER,
    });
    if (!claims?.sub) throw new UnauthorizedError('Token missing sub claim');
    return claims.sub;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new UnauthorizedError(`JWT verification failed: ${msg}`);
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd chefflow-worker && npx vitest run src/auth.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow-worker/src/auth.ts chefflow-worker/src/auth.test.ts
git commit -m "feat(worker): Clerk JWT verification with DI for tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Per-user daily rate limit (TDD)

**Files:**
- Create: `chefflow-worker/src/rateLimit.ts`
- Create: `chefflow-worker/src/rateLimit.test.ts`

- [ ] **Step 1: Write the failing test**

Write `chefflow-worker/src/rateLimit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { consumeDailyQuota, RateLimitExceeded } from './rateLimit';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    RATE_LIMIT: KVNamespace;
  }
}

beforeEach(async () => {
  // Wipe the in-memory KV between tests
  const keys = (await env.RATE_LIMIT.list()).keys;
  for (const k of keys) await env.RATE_LIMIT.delete(k.name);
});

describe('consumeDailyQuota', () => {
  it('first call returns count=1 below the limit', async () => {
    const out = await consumeDailyQuota(env.RATE_LIMIT, 'user_a', 5);
    expect(out.count).toBe(1);
    expect(out.remaining).toBe(4);
  });

  it('Nth call returns count=N until the limit', async () => {
    for (let i = 1; i <= 5; i++) {
      const out = await consumeDailyQuota(env.RATE_LIMIT, 'user_a', 5);
      expect(out.count).toBe(i);
    }
  });

  it('throws RateLimitExceeded on the (limit+1)th call', async () => {
    for (let i = 0; i < 5; i++) {
      await consumeDailyQuota(env.RATE_LIMIT, 'user_a', 5);
    }
    await expect(consumeDailyQuota(env.RATE_LIMIT, 'user_a', 5))
      .rejects.toBeInstanceOf(RateLimitExceeded);
  });

  it('counts users independently', async () => {
    for (let i = 0; i < 5; i++) {
      await consumeDailyQuota(env.RATE_LIMIT, 'user_a', 5);
    }
    const outB = await consumeDailyQuota(env.RATE_LIMIT, 'user_b', 5);
    expect(outB.count).toBe(1);
  });

  it('exposes retryAfterSeconds on the error so the worker can set Retry-After', async () => {
    for (let i = 0; i < 5; i++) {
      await consumeDailyQuota(env.RATE_LIMIT, 'user_a', 5);
    }
    try {
      await consumeDailyQuota(env.RATE_LIMIT, 'user_a', 5);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceeded);
      const r = (err as RateLimitExceeded).retryAfterSeconds;
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(26 * 60 * 60);
    }
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd chefflow-worker && npx vitest run src/rateLimit.test.ts
```

Expected: fail with "Cannot find module './rateLimit'".

- [ ] **Step 3: Implement rateLimit.ts**

Write `chefflow-worker/src/rateLimit.ts`:

```ts
const TTL_SECONDS = 26 * 60 * 60; // 26h — survives the UTC-day boundary

export class RateLimitExceeded extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('Daily quota exceeded');
    this.name = 'RateLimitExceeded';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface QuotaResult {
  count: number;
  remaining: number;
}

/**
 * Increment the per-user-per-UTC-day quota counter and return the new count.
 * KV has no atomic INCR; read-then-put is fine at 30/day-per-user scale.
 * Throws RateLimitExceeded when the limit is reached.
 */
export async function consumeDailyQuota(
  kv: KVNamespace,
  userId: string,
  limit: number,
  now: Date = new Date(),
): Promise<QuotaResult> {
  const key = `rl:${userId}:${utcDateKey(now)}`;
  const current = await kv.get(key);
  const count = (current ? parseInt(current, 10) : 0) + 1;
  if (count > limit) {
    throw new RateLimitExceeded(secondsUntilUtcMidnight(now));
  }
  await kv.put(key, String(count), { expirationTtl: TTL_SECONDS });
  return { count, remaining: limit - count };
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function secondsUntilUtcMidnight(d: Date): number {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return Math.max(1, Math.floor((next.getTime() - d.getTime()) / 1000));
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd chefflow-worker && npx vitest run src/rateLimit.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow-worker/src/rateLimit.ts chefflow-worker/src/rateLimit.test.ts
git commit -m "feat(worker): per-user daily rate limit backed by Workers KV

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Shared types and the AI-call helper

**Files:**
- Create: `chefflow-worker/src/types.ts`
- Create: `chefflow-worker/src/aiCall.ts`
- Create: `chefflow-worker/src/aiCall.test.ts`

- [ ] **Step 1: Create the shared types file**

Write `chefflow-worker/src/types.ts`:

```ts
export type MultimodalPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ProxyRequestBody {
  systemPrompt: string;
  userPrompt?: string;
  userContent?: string | MultimodalPart[];
  /** When false, the worker sends response_format=text (vision model fallback). */
  jsonMode?: boolean;
}

export interface ProxyResponseBody {
  content: string;
}

export const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
```

- [ ] **Step 2: Write the failing test**

Write `chefflow-worker/src/aiCall.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
cd chefflow-worker && npx vitest run src/aiCall.test.ts
```

Expected: fail with "Cannot find module './aiCall'".

- [ ] **Step 4: Implement aiCall.ts**

Write `chefflow-worker/src/aiCall.ts`:

```ts
import type { ProxyRequestBody } from './types';

/**
 * Call Workers AI with a chat-completion shape. Forwards the user-supplied
 * system + user messages verbatim — the worker holds NO prompts of its own,
 * so the SPA's prompt builders remain the single source of truth.
 */
export async function runAi(
  ai: Ai,
  model: string,
  body: ProxyRequestBody,
): Promise<string> {
  const userContent = body.userContent !== undefined ? body.userContent : body.userPrompt;
  if (userContent === undefined || userContent === '') {
    throw new Error('Request must include userPrompt or userContent');
  }
  const responseType = body.jsonMode === false ? 'text' : 'json_object';
  const payload = {
    messages: [
      { role: 'system', content: body.systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: responseType },
  };
  // Workers AI returns { response: string } for chat-completion models.
  const result = (await ai.run(model, payload)) as { response?: string };
  const content = result?.response ?? '';
  if (!content) throw new Error('Empty AI response');
  return content;
}
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
cd chefflow-worker && npx vitest run src/aiCall.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow-worker/src/types.ts chefflow-worker/src/aiCall.ts chefflow-worker/src/aiCall.test.ts
git commit -m "feat(worker): shared types + runAi helper for Workers AI calls

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Endpoint handlers (generate / analyze / photo / workflow)

**Files:**
- Create: `chefflow-worker/src/endpoints.ts`
- Create: `chefflow-worker/src/endpoints.test.ts`

- [ ] **Step 1: Write the failing test**

Write `chefflow-worker/src/endpoints.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd chefflow-worker && npx vitest run src/endpoints.test.ts
```

Expected: fail with "Cannot find module './endpoints'".

- [ ] **Step 3: Implement endpoints.ts**

Write `chefflow-worker/src/endpoints.ts`:

```ts
import { runAi } from './aiCall';
import { TEXT_MODEL, VISION_MODEL, type ProxyRequestBody } from './types';

export type EndpointName = 'generate' | 'analyze' | 'photo' | 'workflow';

export const ENDPOINTS: ReadonlySet<EndpointName> = new Set([
  'generate', 'analyze', 'photo', 'workflow',
]);

/**
 * Dispatch a request body to the right Workers AI model. The photo endpoint
 * defaults to plain-text response format because the vision model on CF
 * sometimes ignores JSON mode — the SPA validator already tolerates
 * markdown fences around JSON.
 */
export async function handleEndpoint(
  name: EndpointName,
  ai: Ai,
  body: ProxyRequestBody,
): Promise<string> {
  switch (name) {
    case 'generate':
    case 'analyze':
    case 'workflow':
      return runAi(ai, TEXT_MODEL, body);
    case 'photo':
      return runAi(ai, VISION_MODEL, { ...body, jsonMode: body.jsonMode ?? false });
    default:
      throw new Error(`Unknown endpoint: ${String(name)}`);
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd chefflow-worker && npx vitest run src/endpoints.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow-worker/src/endpoints.ts chefflow-worker/src/endpoints.test.ts
git commit -m "feat(worker): endpoint dispatcher (generate/analyze/photo/workflow)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Worker request router + full integration test

**Files:**
- Modify: `chefflow-worker/src/index.ts`
- Create: `chefflow-worker/src/index.test.ts`

- [ ] **Step 1: Write the failing integration test**

Write `chefflow-worker/src/index.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from './index';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    RATE_LIMIT: KVNamespace;
    AI: Ai;
    CLERK_ISSUER: string;
    CLERK_JWT_KEY: string;
    DAILY_LIMIT: string;
  }
}

beforeEach(async () => {
  const keys = (await env.RATE_LIMIT.list()).keys;
  for (const k of keys) await env.RATE_LIMIT.delete(k.name);
});

// Stub the AI binding so tests don't burn neurons
function withStubbedAi() {
  (env as unknown as { AI: Ai }).AI = {
    run: vi.fn(async () => ({ response: '{"title":"x"}' })),
  } as unknown as Ai;
}

// Inject a Clerk verifier stub by setting a global for index.ts to pick up
function withAuth(userId: string | null) {
  (globalThis as unknown as { __TEST_VERIFY__?: () => Promise<{ sub: string } | undefined> })
    .__TEST_VERIFY__ = userId
      ? async () => ({ sub: userId })
      : async () => { throw new Error('bad token'); };
}

function authedReq(path: string, body: unknown = {}): Request {
  return new Request(`https://api.test${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer fake.jwt.token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function fetchWorker(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('worker routing', () => {
  it('404 for non-/api/llm paths', async () => {
    withStubbedAi(); withAuth('user_a');
    const res = await fetchWorker(new Request('https://api.test/'));
    expect(res.status).toBe(404);
  });

  it('401 when Authorization header is missing', async () => {
    withStubbedAi();
    const res = await fetchWorker(new Request('https://api.test/api/llm/generate', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('401 when token verification fails', async () => {
    withStubbedAi(); withAuth(null);
    const res = await fetchWorker(authedReq('/api/llm/generate', { systemPrompt: 'S', userPrompt: 'U' }));
    expect(res.status).toBe(401);
  });

  it('200 + JSON content on a valid generate call', async () => {
    withStubbedAi(); withAuth('user_a');
    const res = await fetchWorker(authedReq('/api/llm/generate', { systemPrompt: 'S', userPrompt: 'U' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { content: string };
    expect(json.content).toBe('{"title":"x"}');
  });

  it('404 on an unknown /api/llm endpoint', async () => {
    withStubbedAi(); withAuth('user_a');
    const res = await fetchWorker(authedReq('/api/llm/nope', { systemPrompt: 'S', userPrompt: 'U' }));
    expect(res.status).toBe(404);
  });

  it('429 with Retry-After after exceeding the daily limit', async () => {
    withStubbedAi(); withAuth('user_a');
    // DAILY_LIMIT in test env is set to 3 (see Step 2 wrangler.toml change below)
    for (let i = 0; i < 3; i++) {
      const ok = await fetchWorker(authedReq('/api/llm/generate', { systemPrompt: 'S', userPrompt: 'U' }));
      expect(ok.status).toBe(200);
    }
    const limited = await fetchWorker(authedReq('/api/llm/generate', { systemPrompt: 'S', userPrompt: 'U' }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toMatch(/^\d+$/);
  });
});
```

- [ ] **Step 2: Lower DAILY_LIMIT in test config so the 429 test runs fast**

Edit `chefflow-worker/wrangler.toml` — in the `[vars]` section change:

```toml
[vars]
CLERK_ISSUER = "https://example.clerk.accounts.dev"
DAILY_LIMIT = "30"
```

to add a test-only override under `[env.test.vars]`:

```toml
[vars]
CLERK_ISSUER = "https://example.clerk.accounts.dev"
DAILY_LIMIT = "30"

[env.test.vars]
CLERK_ISSUER = "https://example.clerk.accounts.dev"
DAILY_LIMIT = "3"
```

And edit `chefflow-worker/vitest.config.ts`:

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml', environment: 'test' },
      },
    },
  },
});
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
cd chefflow-worker && npx vitest run src/index.test.ts
```

Expected: fail — the stub index.ts only returns "chefflow-llm-proxy" 200 for `/`; everything else either doesn't match the assertions or the router isn't there.

- [ ] **Step 4: Implement the router**

Write `chefflow-worker/src/index.ts` (replaces the stub):

```ts
import { verifyClerkRequest, UnauthorizedError } from './auth';
import { consumeDailyQuota, RateLimitExceeded } from './rateLimit';
import { handleEndpoint, ENDPOINTS, type EndpointName } from './endpoints';
import type { ProxyRequestBody, ProxyResponseBody } from './types';

export interface Env {
  AI: Ai;
  RATE_LIMIT: KVNamespace;
  CLERK_ISSUER: string;
  CLERK_JWT_KEY: string;
  DAILY_LIMIT: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
} as const;

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(req.url);
    const match = /^\/api\/llm\/([a-z]+)\/?$/.exec(url.pathname);
    if (!match) return json({ error: 'Not found' }, 404);

    const endpoint = match[1] as EndpointName;
    if (!ENDPOINTS.has(endpoint)) return json({ error: 'Unknown endpoint' }, 404);

    // 1) Auth — Clerk JWT
    let userId: string;
    try {
      // Test hook: when present, use the injected verifier instead of real Clerk.
      const testVerify = (globalThis as unknown as {
        __TEST_VERIFY__?: (t: string, o: { jwtKey: string; issuer: string }) => Promise<{ sub: string } | undefined>;
      }).__TEST_VERIFY__;
      userId = await verifyClerkRequest(req, env, testVerify);
    } catch (err) {
      if (err instanceof UnauthorizedError) return json({ error: err.message }, 401);
      throw err;
    }

    // 2) Rate limit
    const limit = parseInt(env.DAILY_LIMIT, 10) || 30;
    try {
      await consumeDailyQuota(env.RATE_LIMIT, userId, limit);
    } catch (err) {
      if (err instanceof RateLimitExceeded) {
        return json(
          { error: err.message },
          429,
          { 'Retry-After': String(err.retryAfterSeconds) },
        );
      }
      throw err;
    }

    // 3) Parse + dispatch
    let body: ProxyRequestBody;
    try {
      body = (await req.json()) as ProxyRequestBody;
    } catch {
      return json({ error: 'Request body must be JSON' }, 400);
    }
    if (!body.systemPrompt || typeof body.systemPrompt !== 'string') {
      return json({ error: 'systemPrompt is required' }, 400);
    }

    let content: string;
    try {
      content = await handleEndpoint(endpoint, env.AI, body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 502);
    }
    const response: ProxyResponseBody = { content };
    return json(response, 200);
  },
};
```

- [ ] **Step 5: Run all worker tests**

```bash
cd chefflow-worker && npx vitest run
```

Expected: all tests pass (auth + rateLimit + aiCall + endpoints + index).

- [ ] **Step 6: Typecheck**

```bash
cd chefflow-worker && npx tsc --noEmit
```

Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow-worker/src/index.ts chefflow-worker/src/index.test.ts chefflow-worker/wrangler.toml chefflow-worker/vitest.config.ts
git commit -m "feat(worker): request router with auth + rate-limit + endpoint dispatch

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Local dry-run smoke

**Files:** (none — this is a manual verification step)

- [ ] **Step 1: Set up a `.dev.vars` file for `wrangler dev`**

Write `chefflow-worker/.dev.vars` (gitignored):

```
CLERK_JWT_KEY=PLACEHOLDER_FOR_DEV_DRY_RUN
```

- [ ] **Step 2: Boot the Worker locally**

```bash
cd chefflow-worker && npx wrangler dev --local
```

Expected: server starts on `http://localhost:8787`.

- [ ] **Step 3: Verify 401 without an Authorization header**

In a second terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8787/api/llm/generate \
  -H "Content-Type: application/json" \
  -d '{"systemPrompt":"s","userPrompt":"u"}'
```

Expected: `401`.

- [ ] **Step 4: Stop wrangler**

`Ctrl+C` in the wrangler terminal.

- [ ] **Step 5: Commit the dry-run dotenv stub**

```bash
cd "/Users/derekshek/vs code"
# Confirm .dev.vars is gitignored (added in Task 1)
git status chefflow-worker/.dev.vars
# Expected: file not listed in `git status` output
```

(If it shows up, append `.dev.vars` to `chefflow-worker/.gitignore` and commit that.)

---

## Phase B — SPA wiring (`chefflow/`)

### Task 8: Install Clerk and wrap the app in ClerkProvider

**Files:**
- Modify: `chefflow/package.json`
- Modify: `chefflow/src/main.tsx`
- Modify: `chefflow/.env.local` (untracked, dev-only)

- [ ] **Step 1: Install the Clerk React SDK**

```bash
cd chefflow && npm install @clerk/clerk-react
```

Expected: package.json gains `@clerk/clerk-react` under dependencies.

- [ ] **Step 2: Add the Clerk publishable key to `.env.local`**

Append to `chefflow/.env.local` (do NOT commit; the file is in `.gitignore`):

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_AFTER_CLERK_DASHBOARD_SETUP
VITE_LLM_MODE=groq
```

(The `pk_test_…` value gets replaced in Task 18 after Clerk dashboard setup. `groq` mode keeps local dev working without the Worker.)

- [ ] **Step 3: Read the current main.tsx to know its shape**

```bash
cat chefflow/src/main.tsx
```

- [ ] **Step 4: Wrap the app in ClerkProvider**

Edit `chefflow/src/main.tsx` — replace the existing tree with:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import './index.css';

const publishableKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? '';
if (!publishableKey) {
  console.warn('VITE_CLERK_PUBLISHABLE_KEY is missing — auth UI will fail to mount.');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={publishableKey}>
      <App />
    </ClerkProvider>
  </StrictMode>,
);
```

(If the current main.tsx has additional providers — router, theme, etc. — preserve them inside the `<ClerkProvider>` exactly as before.)

- [ ] **Step 5: Run the dev server and confirm no errors**

```bash
cd chefflow && npm run dev
```

Expected: server starts; opening http://localhost:5174 in a browser shows whatever was there before (Clerk's `<SignedIn>` gate isn't installed yet — that's Task 10).

Stop the dev server with Ctrl+C.

- [ ] **Step 6: Typecheck**

```bash
cd chefflow && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow/package.json chefflow/package-lock.json chefflow/src/main.tsx
git commit -m "feat(auth): install Clerk SDK and wrap app in ClerkProvider

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: SignInScreen component

**Files:**
- Create: `chefflow/src/ui/components/SignInScreen.tsx`
- Create: `chefflow/src/ui/components/SignInScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Write `chefflow/src/ui/components/SignInScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SignInScreen from './SignInScreen';

vi.mock('@clerk/clerk-react', () => ({
  SignIn: () => <div data-testid="clerk-signin">[Clerk SignIn widget]</div>,
}));

describe('SignInScreen', () => {
  it('renders the ChefFlow heading and tagline', () => {
    render(<SignInScreen />);
    expect(screen.getByRole('heading', { name: /chefflow/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it('mounts the Clerk SignIn widget', () => {
    render(<SignInScreen />);
    expect(screen.getByTestId('clerk-signin')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd chefflow && npx vitest run src/ui/components/SignInScreen.test.tsx
```

Expected: fail with "Cannot find module './SignInScreen'".

- [ ] **Step 3: Implement SignInScreen**

Write `chefflow/src/ui/components/SignInScreen.tsx`:

```tsx
import { SignIn } from '@clerk/clerk-react';
import { ChefHat } from 'lucide-react';

export default function SignInScreen() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12
                 bg-slate-50 dark:bg-kitchen-ink"
    >
      <header className="text-center mb-8">
        <ChefHat className="h-10 w-10 mx-auto text-accent" aria-hidden="true" />
        <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">
          ChefFlow
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Sign in to plan recipes, build workflows, and run service.
        </p>
      </header>
      <SignIn
        appearance={{
          elements: {
            card: 'shadow-md border border-slate-200 dark:border-slate-700',
            formButtonPrimary: 'bg-accent hover:bg-accent/90',
          },
        }}
      />
    </main>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd chefflow && npx vitest run src/ui/components/SignInScreen.test.tsx
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow/src/ui/components/SignInScreen.tsx chefflow/src/ui/components/SignInScreen.test.tsx
git commit -m "feat(auth): SignInScreen with ChefFlow branding + Clerk widget

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: Gate routes with SignedIn/SignedOut + add UserButton

**Files:**
- Modify: `chefflow/src/App.tsx`
- Modify: `chefflow/src/ui/layout/BottomNav.tsx`
- Create: `chefflow/src/test-helpers/clerkMock.tsx`

- [ ] **Step 1: Read the current App.tsx and BottomNav.tsx to know their shape**

```bash
cat chefflow/src/App.tsx
cat chefflow/src/ui/layout/BottomNav.tsx
```

- [ ] **Step 2: Create a Clerk mock for the test helper directory**

Write `chefflow/src/test-helpers/clerkMock.tsx`:

```tsx
import { vi } from 'vitest';

/**
 * Vitest factory for stubbing Clerk hooks/components in component tests.
 * Existing tests that don't care about auth get a signed-in user by default;
 * tests that need the signed-out flow can override.
 *
 * Usage:
 *   vi.mock('@clerk/clerk-react', () => clerkMockSignedIn('user_test_abc'));
 *   // or
 *   vi.mock('@clerk/clerk-react', () => clerkMockSignedOut());
 */
export function clerkMockSignedIn(userId = 'user_test_abc') {
  return {
    ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SignedOut: () => null,
    SignIn: () => <div data-testid="clerk-signin" />,
    UserButton: () => <button type="button" aria-label="User menu">U</button>,
    useUser: () => ({ isLoaded: true, isSignedIn: true, user: { id: userId } }),
    useAuth: () => ({
      isLoaded: true,
      isSignedIn: true,
      userId,
      getToken: vi.fn(async () => 'fake.jwt.token'),
    }),
  };
}

export function clerkMockSignedOut() {
  return {
    ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SignedIn: () => null,
    SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SignIn: () => <div data-testid="clerk-signin" />,
    UserButton: () => null,
    useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
    useAuth: () => ({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      getToken: vi.fn(async () => null),
    }),
  };
}
```

- [ ] **Step 3: Wrap routes in SignedIn / SignedOut**

Edit `chefflow/src/App.tsx`. Add the imports near the top:

```tsx
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import SignInScreen from './ui/components/SignInScreen';
```

Wrap the existing routes JSX. The exact replacement depends on the file's current shape — locate the top-level `<Routes>` (or whatever wraps the route tree) and wrap as:

```tsx
return (
  <>
    <SignedOut>
      <SignInScreen />
    </SignedOut>
    <SignedIn>
      {/* …existing layout + routes tree goes here verbatim… */}
    </SignedIn>
  </>
);
```

- [ ] **Step 4: Add UserButton to BottomNav**

Edit `chefflow/src/ui/layout/BottomNav.tsx`. Add the import near the top:

```tsx
import { UserButton } from '@clerk/clerk-react';
```

In the rendered nav (after the last tab), append a `<UserButton>` element. The exact JSX depends on the current layout but should be:

```tsx
<div className="ml-auto px-2 self-center">
  <UserButton afterSignOutUrl="/" />
</div>
```

(Place this so it sits at the right end on desktop and inline with other tabs on mobile — match the existing Tailwind layout pattern.)

- [ ] **Step 5: Add the Clerk mock to the existing test setup**

Find the existing Vitest setup file (likely `chefflow/src/setupTests.ts` or named in `vite.config.ts`'s `test.setupFiles`). Run:

```bash
grep -rn "setupFiles\|setupTests" chefflow/vite.config.ts chefflow/vitest.config.ts 2>/dev/null
ls chefflow/src/setupTests.ts chefflow/src/test-setup.ts chefflow/src/test/setup.ts 2>/dev/null
```

Append to that file:

```ts
import { vi } from 'vitest';
import { clerkMockSignedIn } from './test-helpers/clerkMock';

vi.mock('@clerk/clerk-react', () => clerkMockSignedIn());
```

(If no setup file exists, create `chefflow/src/setupTests.ts` with the above three lines and add `test: { setupFiles: ['./src/setupTests.ts'] }` to `chefflow/vite.config.ts`.)

- [ ] **Step 6: Run the full test suite — confirm existing tests still pass**

```bash
cd chefflow && npx vitest run
```

Expected: all 234 existing tests + 2 new (SignInScreen) = 236 passed.

- [ ] **Step 7: Typecheck**

```bash
cd chefflow && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow/src/App.tsx chefflow/src/ui/layout/BottomNav.tsx chefflow/src/test-helpers/clerkMock.tsx chefflow/src/setupTests.ts chefflow/vite.config.ts
git commit -m "feat(auth): gate app on Clerk sign-in + UserButton + test mocks

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: proxyClient — POST /api/llm/* with Clerk JWT

**Files:**
- Create: `chefflow/src/core/llm/proxyClient.ts`
- Create: `chefflow/src/core/llm/proxyClient.test.ts`

- [ ] **Step 1: Write the failing test**

Write `chefflow/src/core/llm/proxyClient.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { proxyComplete, ProxyClientError } from './proxyClient';

afterEach(() => {
  delete (window as unknown as { Clerk?: unknown }).Clerk;
});

function setupClerk(token: string | null) {
  (window as unknown as { Clerk: unknown }).Clerk = {
    session: token ? { getToken: vi.fn(async () => token) } : null,
  };
}

function fetchReturning(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
  ) as unknown as typeof fetch;
}

describe('proxyComplete', () => {
  it('POSTs to /api/llm/<endpoint> with the Bearer JWT and JSON body', async () => {
    setupClerk('jwt.test.token');
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ content: '{"ok":true}' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const out = await proxyComplete({
      endpoint: 'generate',
      systemPrompt: 'SYS',
      userPrompt: 'USR',
      fetchImpl,
    });
    expect(out).toBe('{"ok":true}');
    expect(capturedUrl).toBe('/api/llm/generate');
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer jwt.test.token');
    const body = JSON.parse(capturedInit?.body as string);
    expect(body).toEqual({ systemPrompt: 'SYS', userPrompt: 'USR' });
  });

  it('throws ProxyClientError 401 when Clerk has no session', async () => {
    setupClerk(null);
    await expect(
      proxyComplete({ endpoint: 'generate', systemPrompt: 'S', userPrompt: 'U', fetchImpl: fetchReturning(200, {}) }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws ProxyClientError with the HTTP status on non-2xx responses', async () => {
    setupClerk('jwt.test.token');
    await expect(
      proxyComplete({
        endpoint: 'generate', systemPrompt: 'S', userPrompt: 'U',
        fetchImpl: fetchReturning(429, { error: 'Daily quota exceeded' }, { 'Retry-After': '3600' }),
      }),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 3600 });
  });

  it('respects userContent (multimodal) over userPrompt when both are passed', async () => {
    setupClerk('jwt.test.token');
    let capturedBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ content: '{}' }), { status: 200 });
    }) as unknown as typeof fetch;
    await proxyComplete({
      endpoint: 'photo',
      systemPrompt: 'SYS',
      userContent: [{ type: 'text', text: 'X' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,A' } }],
      fetchImpl,
    });
    expect(capturedBody).toEqual({
      systemPrompt: 'SYS',
      userContent: [
        { type: 'text', text: 'X' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,A' } },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd chefflow && npx vitest run src/core/llm/proxyClient.test.ts
```

Expected: fail with "Cannot find module './proxyClient'".

- [ ] **Step 3: Implement proxyClient.ts**

Write `chefflow/src/core/llm/proxyClient.ts`:

```ts
import type { MultimodalPart } from '../scheduler/llm/groqClient';

export type ProxyEndpoint = 'generate' | 'analyze' | 'photo' | 'workflow';

export interface ProxyCompletionInput {
  endpoint: ProxyEndpoint;
  systemPrompt: string;
  userPrompt?: string;
  userContent?: string | MultimodalPart[];
  signal?: AbortSignal;
  /** Origin override for cross-host dev (default: same origin). */
  origin?: string;
  /** Test injection. */
  fetchImpl?: typeof fetch;
}

export class ProxyClientError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly upstreamBody?: string;
  constructor(message: string, status: number, opts?: { retryAfterSeconds?: number; upstreamBody?: string }) {
    super(message);
    this.name = 'ProxyClientError';
    this.status = status;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
    this.upstreamBody = opts?.upstreamBody;
  }
}

/**
 * Send an LLM request to the chefflow-llm-proxy Worker. The Clerk session
 * provides the JWT; the SPA never holds a raw API key.
 */
export async function proxyComplete(input: ProxyCompletionInput): Promise<string> {
  const clerk = (window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }).Clerk;
  const token = clerk?.session ? await clerk.session.getToken() : null;
  if (!token) throw new ProxyClientError('Not signed in', 401);

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const origin = (input.origin ?? '').replace(/\/+$/, '');
  const url = `${origin}/api/llm/${input.endpoint}`;

  const body: Record<string, unknown> = { systemPrompt: input.systemPrompt };
  if (input.userContent !== undefined) body.userContent = input.userContent;
  else if (input.userPrompt !== undefined) body.userPrompt = input.userPrompt;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProxyClientError(`Network error: ${msg}`, 0);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const retryAfter = res.headers.get('Retry-After');
    throw new ProxyClientError(
      `Proxy ${res.status} ${res.statusText}`,
      res.status,
      {
        retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : undefined,
        upstreamBody: text.slice(0, 800),
      },
    );
  }

  const payload = (await res.json()) as { content?: string };
  const content = payload.content ?? '';
  if (!content) throw new ProxyClientError('Proxy returned empty content', 502);
  return content;
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd chefflow && npx vitest run src/core/llm/proxyClient.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow/src/core/llm/proxyClient.ts chefflow/src/core/llm/proxyClient.test.ts
git commit -m "feat(llm): proxyClient — POST /api/llm/* with Clerk JWT

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: llmClient — switch between proxy and direct Groq

**Files:**
- Create: `chefflow/src/core/llm/llmClient.ts`
- Create: `chefflow/src/core/llm/llmClient.test.ts`

- [ ] **Step 1: Write the failing test**

Write `chefflow/src/core/llm/llmClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const callGroq = vi.fn(async () => 'groq-response');
const callProxy = vi.fn(async () => 'proxy-response');

vi.mock('../scheduler/llm/groqClient', () => ({
  complete: (...args: unknown[]) => callGroq(...args),
}));
vi.mock('./proxyClient', () => ({
  proxyComplete: (...args: unknown[]) => callProxy(...args),
}));

beforeEach(() => {
  callGroq.mockClear();
  callProxy.mockClear();
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
      vi.resetModules();
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
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd chefflow && npx vitest run src/core/llm/llmClient.test.ts
```

Expected: fail with "Cannot find module './llmClient'".

- [ ] **Step 3: Implement llmClient.ts**

Write `chefflow/src/core/llm/llmClient.ts`:

```ts
import { complete as groqComplete, type MultimodalPart } from '../scheduler/llm/groqClient';
import { proxyComplete, type ProxyEndpoint } from './proxyClient';

export interface CompletionInput {
  endpoint: ProxyEndpoint;
  systemPrompt: string;
  userPrompt?: string;
  userContent?: string | MultimodalPart[];
  signal?: AbortSignal;
  /** Used only in groq mode. */
  apiKey: string;
  model: string;
  /** Used only in groq mode. */
  baseUrl?: string;
  /** Used only in groq mode. */
  fetchImpl?: typeof fetch;
}

/**
 * Pick proxy vs direct-Groq based on build-time env. Production deploys set
 * VITE_LLM_MODE=proxy in Cloudflare Pages env vars; local dev defaults to
 * 'groq' so you don't need a running Worker.
 */
const mode: 'proxy' | 'groq' =
  (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy'
    ? 'proxy'
    : 'groq';

export async function complete(input: CompletionInput): Promise<string> {
  if (mode === 'proxy') {
    return proxyComplete({
      endpoint: input.endpoint,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      userContent: input.userContent,
      signal: input.signal,
    });
  }
  // Groq path — uses the existing client and accepts the same shape.
  return groqComplete({
    apiKey: input.apiKey,
    model: input.model,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    userContent: input.userContent,
    signal: input.signal,
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd chefflow && npx vitest run src/core/llm/llmClient.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow/src/core/llm/llmClient.ts chefflow/src/core/llm/llmClient.test.ts
git commit -m "feat(llm): llmClient.complete switches proxy vs Groq by env

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: Switch recipeGen.ts to llmClient

**Files:**
- Modify: `chefflow/src/core/recipes/llm/recipeGen.ts`

- [ ] **Step 1: Read the current recipeGen.ts**

```bash
cat chefflow/src/core/recipes/llm/recipeGen.ts
```

- [ ] **Step 2: Switch the imports — three replacements**

Edit `chefflow/src/core/recipes/llm/recipeGen.ts`:

Replace the existing import line:

```ts
import { complete, GroqClientError } from '../../scheduler/llm/groqClient';
```

with:

```ts
import { complete } from '../../llm/llmClient';
import { GroqClientError } from '../../scheduler/llm/groqClient';
```

Inside `generateRecipeFromText`, the existing `complete({...})` call becomes:

```ts
const rawJson = await complete({
  endpoint: 'generate',
  apiKey: input.apiKey,
  model: input.model,
  systemPrompt,
  userPrompt,
  baseUrl: input.baseUrl,
  fetchImpl: input.fetchImpl,
  signal: input.signal,
});
```

Inside `generateRecipeFromPhoto`, the existing `complete({...})` call becomes:

```ts
const rawJson = await complete({
  endpoint: 'photo',
  apiKey: input.apiKey,
  model: input.model ?? VISION_MODEL,
  systemPrompt,
  userContent,
  baseUrl: input.baseUrl,
  fetchImpl: input.fetchImpl,
  signal: input.signal,
});
```

Inside `analyzeRecipe`, the existing `complete({...})` call becomes:

```ts
const rawJson = await complete({
  endpoint: 'analyze',
  apiKey: input.apiKey,
  model: input.model,
  systemPrompt,
  userPrompt,
  baseUrl: input.baseUrl,
  fetchImpl: input.fetchImpl,
  signal: input.signal,
});
```

- [ ] **Step 3: Run the recipe tests (existing — should still pass)**

```bash
cd chefflow && npx vitest run src/core/recipes
```

Expected: all 37 recipe tests still pass. (The existing tests inject `fetchImpl` into the orchestrators — they hit the Groq path, which is unchanged in dev mode.)

- [ ] **Step 4: Typecheck**

```bash
cd chefflow && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow/src/core/recipes/llm/recipeGen.ts
git commit -m "refactor(recipes): route LLM calls through llmClient + endpoint tag

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 14: Switch llmScheduler.ts to llmClient

**Files:**
- Modify: `chefflow/src/core/scheduler/llm/llmScheduler.ts`

- [ ] **Step 1: Read the current llmScheduler.ts**

```bash
cat chefflow/src/core/scheduler/llm/llmScheduler.ts
```

- [ ] **Step 2: Switch the import + endpoint tag**

Replace the existing import line:

```ts
import { complete, GroqClientError } from './groqClient';
```

with:

```ts
import { complete } from '../../llm/llmClient';
import { GroqClientError } from './groqClient';
```

Inside `scheduleEventLLM`, the existing `complete({...})` call becomes:

```ts
const rawJson = await complete({
  endpoint: 'workflow',
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  baseUrl,
  fetchImpl,
  signal,
});
```

- [ ] **Step 3: Run the scheduler tests**

```bash
cd chefflow && npx vitest run src/core/scheduler
```

Expected: all existing scheduler tests still pass.

- [ ] **Step 4: Typecheck**

```bash
cd chefflow && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow/src/core/scheduler/llm/llmScheduler.ts
git commit -m "refactor(scheduler): route LLM calls through llmClient

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 15: Strip Groq key handling from Workflow.tsx and GenerateRecipeSheet.tsx

**Files:**
- Modify: `chefflow/src/ui/pages/Workflow.tsx`
- Modify: `chefflow/src/ui/components/GenerateRecipeSheet.tsx`

- [ ] **Step 1: Read both files**

```bash
cat chefflow/src/ui/pages/Workflow.tsx | head -200
cat chefflow/src/ui/components/GenerateRecipeSheet.tsx | head -200
```

- [ ] **Step 2: In Workflow.tsx — remove the env-key fallback in proxy mode**

The current code (around lines 185–191) reads:

```ts
const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
const model = useLlmSettingsStore((s) => s.model);
const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
const apiKey = (storedApiKey || envApiKey).trim();
const isReady = apiKey.length > 0;
```

Replace with a mode-aware version:

```ts
const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
const model = useLlmSettingsStore((s) => s.model);
const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
const isProxyMode = (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy';
// In proxy mode, the worker handles auth via Clerk's JWT — no Groq key needed
// at the call site. In groq dev mode, keep the existing localStorage + env fallback.
const apiKey = isProxyMode ? 'proxy' : (storedApiKey || envApiKey).trim();
const isReady = isProxyMode || apiKey.length > 0;
```

(The `'proxy'` placeholder string is never actually sent — `llmClient` short-circuits to the proxy in this mode; we just need `apiKey` to be a non-empty string so the existing readiness gate clears.)

- [ ] **Step 3: In GenerateRecipeSheet.tsx — same treatment**

The current code (around the top of the component) reads:

```ts
const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
const model = useLlmSettingsStore((s) => s.model);
const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
const apiKey = (storedApiKey || envApiKey).trim();
const hasKey = apiKey.length > 0;
```

Replace with:

```ts
const storedApiKey = useLlmSettingsStore((s) => s.apiKey);
const model = useLlmSettingsStore((s) => s.model);
const envApiKey = ((import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? '').trim();
const isProxyMode = (import.meta.env.VITE_LLM_MODE as string | undefined) === 'proxy';
const apiKey = isProxyMode ? 'proxy' : (storedApiKey || envApiKey).trim();
const hasKey = isProxyMode || apiKey.length > 0;
```

Also hide the "No Groq API key found" amber banner when `isProxyMode` is true — find:

```tsx
{tab !== 'manual' && !hasKey && (
  <p className="text-xs text-amber-700 dark:text-amber-300 inline-flex items-start gap-1.5">
    ...
  </p>
)}
```

Change the condition to `{tab !== 'manual' && !hasKey && !isProxyMode && (...)}`.

- [ ] **Step 4: In AnalysisSection.tsx (if present) — same treatment**

Run:

```bash
grep -n "VITE_GROQ_API_KEY" chefflow/src/ui/components/AnalysisSection.tsx 2>/dev/null
```

If the grep finds matches, apply the same `isProxyMode` pattern from Step 3 to its `apiKey`/`hasKey` derivation. If no matches, skip this step.

- [ ] **Step 5: Run the affected test files**

```bash
cd chefflow && npx vitest run src/ui/pages/Workflow.test.tsx
```

Expected: existing Workflow tests still pass. (Tests inject state into `useLlmSettingsStore` directly so they're unaffected by `VITE_LLM_MODE`.)

- [ ] **Step 6: Run the full suite to catch regressions**

```bash
cd chefflow && npx vitest run
```

Expected: 236+ tests, all green.

- [ ] **Step 7: Typecheck**

```bash
cd chefflow && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
cd "/Users/derekshek/vs code"
git add chefflow/src/ui/pages/Workflow.tsx chefflow/src/ui/components/GenerateRecipeSheet.tsx chefflow/src/ui/components/AnalysisSection.tsx
git commit -m "refactor(ui): bypass Groq-key gate when VITE_LLM_MODE=proxy

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 16: Local end-to-end dev verification

**Files:** (none — this is a manual verification step)

- [ ] **Step 1: Confirm `.env.local` still has Groq dev credentials**

```bash
grep -E '^VITE_(CLERK_PUBLISHABLE_KEY|LLM_MODE|GROQ_API_KEY)' chefflow/.env.local
```

Expected output (values redacted):

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_LLM_MODE=groq
VITE_GROQ_API_KEY=gsk_...
```

If `VITE_GROQ_API_KEY` is missing, you cannot run the dev server end-to-end until Task 18 is done. Add the existing Groq key back from the original `.env.local`.

- [ ] **Step 2: Start the dev server**

```bash
cd chefflow && npm run dev
```

Expected: server starts at `http://localhost:5174/`.

- [ ] **Step 3: Manual smoke (browser)**

Open `http://localhost:5174/` and verify:

1. The Clerk sign-in widget renders (full-screen with ChefFlow heading).
2. If you have a Clerk dev account configured, sign in. If not, this step blocks until Task 18 — note the limitation and continue.
3. After sign-in: Recipes library renders; the existing recipes are visible.
4. The top-right `UserButton` (initial of your account) renders.
5. Open Network tab → reload → confirm no `/api/llm/*` requests fire on idle (only LLM endpoints) and the Groq endpoint is still the target of any test generation.

- [ ] **Step 4: Stop the dev server**

`Ctrl+C` in the terminal.

(No commit — verification only.)

---

## Phase C — Deploy + verify on Cloudflare

### Task 17: Clerk dashboard setup (one-time)

**Files:** (none — manual browser steps)

- [ ] **Step 1: Create the Clerk app**

Open https://dashboard.clerk.com → "Create application" → name "ChefFlow" → keep default settings.

- [ ] **Step 2: Enable Email magic-code**

Sidebar → "User & Authentication" → "Email, Phone, Username" → toggle ON **Email address** → strategy **Email verification code** (NOT password).

- [ ] **Step 3: Enable Google OAuth**

Sidebar → "User & Authentication" → "Social Connections" → toggle ON **Google** → accept default OAuth credentials.

- [ ] **Step 4: Capture the keys**

Sidebar → "API Keys" → record:

| Variable | Value |
|---|---|
| Publishable key (dev) | `pk_test_…` |
| Publishable key (production, after activating live mode) | `pk_live_…` |
| Frontend API URL | `https://<your-app>.clerk.accounts.dev` |

Sidebar → "JWT Templates" → "default" (or create one) → copy the JWKS public key (PEM-encoded RSA, starts with `-----BEGIN PUBLIC KEY-----`).

- [ ] **Step 5: Add the dev publishable key to .env.local**

Replace the placeholder in `chefflow/.env.local`:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REAL_VALUE_FROM_DASHBOARD
```

- [ ] **Step 6: Restart `npm run dev` and confirm sign-in works**

```bash
cd chefflow && npm run dev
```

Open http://localhost:5174 → sign in with email-code → land on the Recipes library. Verify the `UserButton` shows your initial.

- [ ] **Step 7: Sign in with Google**

Sign out → re-sign-in with "Continue with Google". Confirm it lands on the library.

- [ ] **Step 8: Stop dev server**

(No commit — `.env.local` is gitignored.)

---

### Task 18: Cloudflare account + Wrangler setup (one-time)

**Files:** Modifies `chefflow-worker/wrangler.toml` with real KV id + issuer.

- [ ] **Step 1: Create the Cloudflare account**

Sign up at https://dash.cloudflare.com (free).

- [ ] **Step 2: Authenticate Wrangler**

```bash
cd chefflow-worker && npx wrangler login
```

Browser opens for OAuth → approve → terminal shows "Successfully logged in".

- [ ] **Step 3: Create the rate-limit KV namespace**

```bash
cd chefflow-worker && npx wrangler kv namespace create RATE_LIMIT
```

Expected: prints the namespace id, e.g.:

```
✨ Created namespace with title "chefflow-llm-proxy-RATE_LIMIT"
  id = "abc123def456abc123def456abc123de"
```

- [ ] **Step 4: Paste the id into wrangler.toml**

Edit `chefflow-worker/wrangler.toml` — replace the `TODO_REPLACE_AFTER_NAMESPACE_CREATE` placeholder:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "abc123def456abc123def456abc123de"
```

- [ ] **Step 5: Set the Clerk issuer URL**

Edit `chefflow-worker/wrangler.toml` — replace the placeholder `CLERK_ISSUER`:

```toml
[vars]
CLERK_ISSUER = "https://<your-app>.clerk.accounts.dev"
DAILY_LIMIT = "30"
```

- [ ] **Step 6: Set the Clerk JWT key as a secret**

```bash
cd chefflow-worker && npx wrangler secret put CLERK_JWT_KEY
```

Prompt: paste the full PEM (including `-----BEGIN PUBLIC KEY-----` / `-----END PUBLIC KEY-----` lines) → Enter.

Expected: "Success! Uploaded secret CLERK_JWT_KEY".

- [ ] **Step 7: Commit wrangler.toml updates**

```bash
cd "/Users/derekshek/vs code"
git add chefflow-worker/wrangler.toml
git commit -m "chore(worker): wire real KV namespace + Clerk issuer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 19: Deploy the Worker

**Files:** (none — deploy commands only)

- [ ] **Step 1: Deploy**

```bash
cd chefflow-worker && npx wrangler deploy
```

Expected output ends with a URL such as:

```
Published chefflow-llm-proxy (X sec)
  https://chefflow-llm-proxy.<your-subdomain>.workers.dev
```

- [ ] **Step 2: Smoke test the deployed Worker**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://chefflow-llm-proxy.<your-subdomain>.workers.dev/api/llm/generate \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `401` (no Authorization header).

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://chefflow-llm-proxy.<your-subdomain>.workers.dev/
```

Expected: `404` (root path is not routed).

---

### Task 20: Cloudflare Pages — first deploy

**Files:** (none — CF dashboard steps)

- [ ] **Step 1: Connect the repo**

Cloudflare dashboard → Pages → "Connect to Git" → authorize GitHub → pick the ChefFlow repo.

- [ ] **Step 2: Configure the build**

| Setting | Value |
|---|---|
| Project name | `chefflow` |
| Production branch | `main` |
| Build command | `cd chefflow && npm ci && npm run build` |
| Build output directory | `chefflow/dist` |
| Root directory | (leave blank) |

- [ ] **Step 3: Add environment variables**

In the same setup screen → "Environment variables" (for "Production"):

| Variable | Value |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` (the production key from Clerk) |
| `VITE_LLM_MODE` | `proxy` |

**Critically: do NOT add `VITE_GROQ_API_KEY` here.** Its absence is the guarantee that no Groq key lands in the bundle.

- [ ] **Step 4: Trigger the deploy**

"Save and Deploy" → wait ~2 min → URL appears, e.g. `https://chefflow.pages.dev`.

- [ ] **Step 5: Sanity check the bundle does not contain a Groq key**

```bash
# Replace <slug> with the deployment slug shown in CF Pages
curl -s https://chefflow.pages.dev/ > /tmp/index.html
grep -E '"gsk_[a-zA-Z0-9_-]{20,}"' /tmp/index.html
# Expected: no output

# Also pull and grep one of the bundled JS files
JS_URL=$(grep -oE 'https://chefflow\.pages\.dev/assets/[^"]+\.js' /tmp/index.html | head -1)
curl -s "$JS_URL" | grep -E "gsk_[a-zA-Z0-9_-]{20,}"
# Expected: no output
```

Both greps must return zero matches.

---

### Task 21: Pages → Worker route (`/api/llm/*` same-origin)

**Files:** (none — CF dashboard steps)

- [ ] **Step 1: Add the Pages function binding**

Cloudflare dashboard → your Pages project → Settings → Functions → "Service bindings" → Add binding:

| Setting | Value |
|---|---|
| Variable name | `LLM_PROXY` |
| Service | `chefflow-llm-proxy` |
| Environment | `production` |

- [ ] **Step 2: Create a `_routes.json` to forward /api/llm/* to the Worker**

Pages can route URL prefixes to a Worker by including a `chefflow/public/_routes.json` file. Write `chefflow/public/_routes.json`:

```json
{
  "version": 1,
  "include": ["/api/llm/*"],
  "exclude": []
}
```

Plus a Pages Function entry that re-emits to the Worker. Write `chefflow/functions/api/llm/[[path]].ts`:

```ts
interface Env { LLM_PROXY: Fetcher }

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  return env.LLM_PROXY.fetch(request);
};
```

- [ ] **Step 3: Push and redeploy**

```bash
cd "/Users/derekshek/vs code"
git add chefflow/public/_routes.json chefflow/functions/api/llm/
git commit -m "feat(pages): route /api/llm/* to chefflow-llm-proxy worker

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

CF Pages auto-deploys on push (~2 min). Watch the deploys tab until green.

- [ ] **Step 4: Smoke the same-origin route**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://chefflow.pages.dev/api/llm/generate \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `401` (same shape as Task 19 step 2, proving the Worker is reachable through the Pages route).

- [ ] **Step 5: Add the public URL to Clerk's Authorized Origins**

Clerk dashboard → "Domains" (or "Allowed origins") → add `https://chefflow.pages.dev`.

---

### Task 22: End-to-end production acceptance check

**Files:** (none — manual + automated verification)

- [ ] **Step 1: Automated**

```bash
cd chefflow && npx tsc -p tsconfig.app.json --noEmit && npx vitest run
cd ../chefflow-worker && npx tsc --noEmit && npx vitest run
```

Expected: both packages typecheck clean; all tests pass.

- [ ] **Step 2: Walk the spec's 12 acceptance criteria on the live URL**

Open https://chefflow.pages.dev in an incognito window and verify each:

1. ✅ `grep -r "gsk_" chefflow/dist/` after a local `npm run build` (with VITE_LLM_MODE=proxy and no VITE_GROQ_API_KEY) returns zero matches:
   ```bash
   cd chefflow && VITE_LLM_MODE=proxy npm run build && grep -r "gsk_" dist/ || echo "CLEAN"
   ```
2. ✅ Incognito visit shows the Clerk sign-in widget; no app UI before sign-in.
3. ✅ Sign in via email magic-code → land on Recipes library.
4. ✅ Sign in via "Continue with Google" → land on Recipes library.
5. ✅ Recipes → New recipe → Describe → "Beef Bourguignon, 4 portions" → Generate → editor populates. Network tab shows `POST /api/llm/generate` 200 with `Authorization: Bearer eyJ…` (Clerk JWT, NOT a `gsk_…` Groq key).
6. ✅ Editor → "Analyse with AI" → kcal + tags + allergen pills appear.
7. ✅ Generate → Photo tab → upload a printed recipe → editor populates.
8. ✅ Demo Event → Generate Workflow → Prep/Cook/Serve phases render.
9. ✅ In devtools console:
   ```js
   await fetch('/api/llm/generate', { method: 'POST', body: '{}' }).then(r => r.status)
   ```
   Expected: `401`.
10. ✅ Loop 31 calls and confirm 1× 429 on the 31st:
    ```js
    const token = await window.Clerk.session.getToken();
    const fire = () => fetch('/api/llm/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: 'x', userPrompt: 'y' }),
    }).then(r => r.status);
    const results = [];
    for (let i = 0; i < 31; i++) results.push(await fire());
    console.log(results);  // expect 30× 200 then 1× 429
    ```
11. ✅ Top-right `UserButton` → "Sign out" → redirected to sign-in.
12. ✅ Browser console clean: no React warnings, no failed network requests on the happy path.

- [ ] **Step 3: Final commit if anything changed during verification**

```bash
cd "/Users/derekshek/vs code"
git status
# If files changed, commit them
git add <files>
git commit -m "fix: address smoke test findings

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push**

```bash
git push
```

---

## Done

The app is live on `https://chefflow.pages.dev`. Anyone with an email or Google account can sign up and use it; the Groq key is gone from the bundle; per-user rate-limit caps abuse at 30 generations/day; rollback for either piece (SPA or Worker) is one CF dashboard click.

V2 follow-ups in the spec (per-user IndexedDB namespacing, sign-out wipe, cloud sync, custom domain, BYO-key override) remain open and unblocked — none of them require backfilling work from v1.
