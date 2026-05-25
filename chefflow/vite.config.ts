import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    // Service worker for offline boot. The existing manifest.webmanifest
    // in public/ stays the source of truth; the plugin only generates the
    // SW + injects registration into index.html. Without this the SPA
    // wouldn't even load on a fresh tab when offline — bug #3 in
    // ~/.claude/plans/1-make-every-user-spicy-sedgewick.md.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      injectRegister: 'auto',
      workbox: {
        // Precache the SPA shell + every hashed asset so the first paint
        // works offline after one online visit.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // Deep-link offline support: any unmatched navigation falls back
        // to the SPA index. Without this, reloading /recipes offline
        // returns a 404 from the cache.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      // Don't activate the SW in `npm run dev` — would break HMR + cache
      // the dev bundle. Production build + preview turn it on.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    fs: {
      // Allow ?raw imports of files in the workspace root (e.g. CulinaryRule.md
      // sits one level above chefflow/, baked into the bundle by prompt.ts).
      allow: ['..'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/vitest.setup.ts'],
    // Exclude Playwright E2E specs — they live in e2e/ and use @playwright/test,
    // not vitest. Without this exclusion vitest tries to run them and throws.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    server: {
      deps: {
        // Same parent-dir allowlist for Vitest's transform pipeline.
        inline: [/CulinaryRule\.md\?raw/],
      },
    },
  },
});
