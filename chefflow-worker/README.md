# chefflow-llm-proxy

Cloudflare Worker that proxies ChefFlow LLM calls. Verifies Clerk JWTs,
rate-limits per user in Workers KV, forwards prompts to Workers AI.

Deploy steps live in [../docs/superpowers/plans/2026-05-16-public-deploy-with-auth.md](../docs/superpowers/plans/2026-05-16-public-deploy-with-auth.md) (Tasks 18–22).
