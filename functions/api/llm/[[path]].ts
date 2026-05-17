// Cloudflare Pages Function — forwards every /api/llm/* request to the
// chefflow-llm-proxy Worker via the LLM_PROXY service binding. Wired up in
// Pages → Functions → Service bindings (Plan Task 21). The Pages function
// runtime injects Cloudflare's types at deploy time; we keep the local
// signature inline so this file compiles without @cloudflare/workers-types
// in the SPA's tsconfig.

interface PagesEnv {
  LLM_PROXY: { fetch(req: Request): Promise<Response> };
}

interface PagesContext {
  request: Request;
  env: PagesEnv;
}

export const onRequest = async ({ request, env }: PagesContext): Promise<Response> => {
  return env.LLM_PROXY.fetch(request);
};
