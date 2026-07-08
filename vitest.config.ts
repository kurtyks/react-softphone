import { defineConfig } from 'vitest/config';

// Standalone Vitest config for unit tests of the pure logic (SIP core, state).
// Independent of Expo/Metro — runs the platform-agnostic TypeScript directly.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts']
  }
});
