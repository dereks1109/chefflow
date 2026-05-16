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
