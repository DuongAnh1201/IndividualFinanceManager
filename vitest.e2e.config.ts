import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";

/**
 * The e2e files share one throw-away database and build on each other's data
 * (flows → phase3 → reports → smoke), so they must run in a fixed alphabetical
 * order. Vitest's default sequencer orders by cached duration/size instead.
 */
class AlphabeticalSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    return files;
  }
}

// Browser smoke tests (QA). Slow: builds the app and drives system Chrome. Run with `npm run test:e2e`.
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
