// Cloudflare Pages Function — forwards every /api/sync/* request to the
// chefflow-llm-proxy Worker via the LLM_PROXY service binding. Same
// pattern as ./llm/[[path]].ts; the binding is set up in Pages →
// Functions → Service bindings (set up alongside the LLM_PROXY binding).

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
