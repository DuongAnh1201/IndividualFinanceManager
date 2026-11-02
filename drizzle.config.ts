import { defineConfig } from "drizzle-kit";

// Schema and migrations are owned by codex2 (src/db).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "data/finance.db" },
});
