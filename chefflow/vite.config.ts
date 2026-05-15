import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
    server: {
      deps: {
        // Same parent-dir allowlist for Vitest's transform pipeline.
        inline: [/CulinaryRule\.md\?raw/],
      },
    },
  },
});
