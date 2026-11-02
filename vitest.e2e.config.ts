import { defineConfig } from "vitest/config";

// Browser smoke tests (QA). Slow: builds the app and drives system Chrome. Run with `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    environment: "node",
    globalSetup: ["e2e/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
