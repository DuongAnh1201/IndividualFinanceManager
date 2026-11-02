/** Shared by the application and migration tooling; override for isolated tests. */
export function databasePath(): string {
  return process.env.DATABASE_URL ?? "data/finance.db";
}
