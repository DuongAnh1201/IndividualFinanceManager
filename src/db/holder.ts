import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase } from "./client";
import { databasePath, migrationsDirectory } from "./config";
import { createRepositories } from "./repositories";
import { seedDatabase } from "./seed";

export type DatabaseConnection = ReturnType<typeof openDatabase>;
export class DatabaseBusyError extends Error {
  constructor() {
    super("Database maintenance is in progress; retry this request shortly.");
    this.name = "DatabaseBusyError";
  }
}
let held: (DatabaseConnection & { repositories: ReturnType<typeof createRepositories> }) | undefined;
let exclusive = false;
let active = 0;
function initialize(path = databasePath()) {
  const connection = openDatabase(path);
  try {
    migrate(connection.db, { migrationsFolder: migrationsDirectory() });
    seedDatabase(connection.db, Intl.DateTimeFormat().resolvedOptions().timeZone);
    return { ...connection, repositories: createRepositories(connection.db) };
  } catch (error) {
    connection.sqlite.close();
    throw error;
  }
}
function current() {
  return (held ??= initialize());
}
function available() {
  if (exclusive) throw new DatabaseBusyError();
}

/** Obtain per request; never cache the returned handle in another module. */
export function getDb() {
  available();
  return current().db;
}
/** Obtain per request; restore replaces the underlying connection and repositories. */
export function getRepositories() {
  available();
  return current().repositories;
}
/** Preferred boundary for synchronous server request/action work. */
export function withDatabase<T>(work: (repos: ReturnType<typeof createRepositories>) => T): T {
  available();
  active++;
  try {
    return work(current().repositories);
  } finally {
    active--;
  }
}
/** Application shutdown/test cleanup only. Requests do not own the shared connection. */
export function closeDatabase(): void {
  available();
  if (active) throw new DatabaseBusyError();
  held?.sqlite.close();
  held = undefined;
}

/** Internal maintenance boundary. New requests fail promptly instead of using stale handles. */
export async function withExclusiveDatabase<T>(
  work: (connection: DatabaseConnection) => Promise<T>,
): Promise<T> {
  available();
  if (active) throw new DatabaseBusyError();
  const connection = current();
  exclusive = true;
  try {
    return await work(connection);
  } finally {
    exclusive = false;
  }
}

/** Internal: staged file must be validated and a safety backup completed first. */
export function replaceHeldDatabase(stagedFile: string): void {
  if (!exclusive || !held) throw new Error("Database replacement requires exclusive maintenance");
  const target = held.sqlite.name;
  if (target === ":memory:") throw new Error("Restore requires a file-backed database");
  const path = resolve(target);
  if (held.sqlite.inTransaction) throw new Error("Cannot restore inside a transaction");
  const checkpoint = held.sqlite.pragma("wal_checkpoint(TRUNCATE)") as { busy: number }[];
  if (checkpoint.some((row) => row.busy !== 0)) throw new Error("Database checkpoint is busy");
  held.sqlite.close();
  held = undefined;
  try {
    if (existsSync(`${path}-wal`) || existsSync(`${path}-shm`))
      throw new Error("Database still has external WAL handles; close them before restore");
    renameSync(stagedFile, path);
  } finally {
    // A failed rename leaves the original file intact; both paths reopen through the holder.
    held = initialize(path);
  }
}
