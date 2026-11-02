import { defineConfig } from "vitest/config";
import { BaseSequencer } from "vitest/node";

/** The specs share one database and build on each other: always run them alphabetically. */
class AlphabeticalSequencer extends BaseSequencer {
  async sort(files: Parameters<BaseSequencer["sort"]>[0]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

// Browser smoke and flow tests (QA). Slow: builds the app and drives system Chrome. Run with `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    environment: "node",
    globalSetup: ["e2e/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    sequence: { sequencer: AlphabeticalSequencer },
  },
});
