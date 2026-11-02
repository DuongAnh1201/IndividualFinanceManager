import { defineConfig } from "drizzle-kit";
import { databasePath } from "./src/db/config";

// Schema and migrations are owned by codex2 (src/db).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: databasePath() },
});
