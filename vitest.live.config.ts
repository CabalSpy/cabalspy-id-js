import { defineConfig } from 'vitest/config';

// Talks to the real, public endpoints (no API key needed).
export default defineConfig({
  test: {
    include: ['test/live/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
