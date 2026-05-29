import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for ChefFlow E2E tests.
 *
 * Key decisions:
 * - webServer starts `vite dev` and waits for port 5173 before any test runs.
 * - VITE_E2E_MODE=true bypasses Clerk so tests exercise the app without a
 *   live auth account. Never set this env var in production builds.
 * - VITE_LLM_MODE=proxy routes LLM calls through /api/llm/* which tests
 *   intercept via page.route() — no real Groq key needed in CI.
 * - Chromium only for now; Firefox/WebKit can be added once the suite is stable.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    // E2E runs on port 5174 to avoid colliding with the normal dev server on
    // 5173. This also makes reuseExistingServer safe: 5174 is E2E-only so any
    // server on that port was started by a previous Playwright run.
    baseURL: 'http://localhost:5174',
    // Capture traces and screenshots on first retry so flaky failures have
    // full context without slowing down the happy path.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Port 5174 is reserved for E2E — separate from the developer's port 5173
    // so VITE_E2E_MODE=true is guaranteed to be in effect.
    command: 'npx vite --port 5174',
    url: 'http://localhost:5174',
    // Never reuse: the E2E server must always start with the E2E env vars.
    reuseExistingServer: false,
    env: {
      // Bypass Clerk auth for all E2E runs.
      VITE_E2E_MODE: 'true',
      // Route LLM calls through the proxy path so page.route() can intercept
      // /api/llm/* without needing a live Groq API key.
      VITE_LLM_MODE: 'proxy',
      // Clerk publishable key. Since 2026-05-24 the TopNav + MobileTopBar
      // call useUser()/useClerk() directly, which throws if ClerkProvider
      // isn't mounted. main.tsx now mounts ClerkProvider in E2E mode too
      // (no real auth flow runs because tests never trigger sign-in), but
      // the key must pass Clerk's strict format validation. The dummy
      // placeholder string we used before fails that check. Reuse the
      // tracked-in-git dev key from .env.production — it's the same one
      // used in normal Pages builds and the Clerk dev instance is happy
      // to initialise without performing real auth requests during E2E.
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_ZW5nYWdpbmctYmF0LTUuY2xlcmsuYWNjb3VudHMuZGV2JA',
    },
    timeout: 30_000,
  },
});
