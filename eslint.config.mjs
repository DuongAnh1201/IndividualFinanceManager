import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([".next/**", "out/**", "coverage/**", "data/**", "next-env.d.ts", "src/db/migrations/**"]),
  {
    // Architecture guard: src/domain is pure (docs/architecture.md, D-010).
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/db", "@/db/*", "@/app", "@/app/*", "@/ui", "@/ui/*"],
              message: "src/domain must not import db/app/ui.",
            },
            {
              group: [
                "react",
                "react-*",
                "next",
                "next/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "better-sqlite3",
                "node:fs",
                "fs",
              ],
              message: "src/domain must stay pure (no UI, DB or I/O).",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Inject the current date instead (D-010)." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Inject the current date instead (D-010).",
        },
      ],
    },
  },
  {
    // Services orchestrate domain rules + db repositories; they must not reach into the UI/app layers.
    files: ["src/services/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app", "@/app/*", "@/ui", "@/ui/*", "react", "react-*", "next", "next/*"],
              message: "src/services may import domain + db, not app/ui/react/next.",
            },
          ],
        },
      ],
    },
  },
  {
    // UI must not touch the database directly.
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/db", "@/db/*", "drizzle-orm", "better-sqlite3"],
              message: "UI must go through app/ server actions.",
            },
          ],
        },
      ],
    },
  },
]);
