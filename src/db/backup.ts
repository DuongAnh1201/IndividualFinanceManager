import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { expensesToCsv, incomesToCsv } from "@/domain/csv";
import { openDatabase } from "./client";
import { databasePath, migrationsDirectory } from "./config";
import { replaceHeldDatabase, withDatabase, withExclusiveDatabase, type DatabaseConnection } from "./holder";

const uniqueName = (kind: string) =>
  `${kind}-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`;
function within(parent: string, path: string): boolean {
  const rel = relative(parent, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
/** Outputs in the checkout belong under git-ignored data/, never beside source files. */
function outputPath(path: string): string {
  const target = resolve(path);
  // Resolve existing ancestors so a symlink cannot route an export into source folders.
  let ancestor = dirname(target);
  const suffix: string[] = [];
  while (!existsSync(ancestor)) {
    suffix.unshift(relative(dirname(ancestor), ancestor));
    ancestor = dirname(ancestor);
  }
  const physical = join(realpathSync(ancestor), ...suffix, relative(dirname(target), target));
  const root = realpathSync(process.cwd());
  if (within(root, physical) && !within(join(root, "data"), physical))
    throw new Error("Backup/export output inside the project must be under data/");
  return target;
}
function defaultFolder(connectionPath = databasePath()): string {
  const path = connectionPath === ":memory:" ? databasePath() : connectionPath;
  return join(dirname(resolve(path)), "backups");
}
function schemaObjects(sqlite: Database.Database) {
  return sqlite
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
    .all();
}
/** Read-only validation: exact shipped migration schema, integrity, FKs, and migration history. */
export function validateBackup(path: string): void {
  const source = new Database(path, { readonly: true, fileMustExist: true });
  const reference = openDatabase(":memory:");
  try {
    const integrity = source.pragma("integrity_check") as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok")
      throw new Error("Backup failed SQLite integrity validation");
    if ((source.pragma("foreign_key_check") as unknown[]).length)
      throw new Error("Backup has invalid foreign keys");
    migrate(reference.db, { migrationsFolder: migrationsDirectory() });
    if (JSON.stringify(schemaObjects(source)) !== JSON.stringify(schemaObjects(reference.sqlite)))
      throw new Error("Backup schema does not match this app version");
    const history = (db: Database.Database) =>
      db.prepare("SELECT hash, created_at FROM __drizzle_migrations ORDER BY id").all();
    if (JSON.stringify(history(source)) !== JSON.stringify(history(reference.sqlite)))
      throw new Error("Backup migration history does not match this app version");
    const settings = source.prepare("SELECT pay_days, timezone FROM settings WHERE id = 1").get() as
      { pay_days: string; timezone: string } | undefined;
    if (!settings) throw new Error("Backup is missing settings");
    const days: unknown = JSON.parse(settings.pay_days);
    if (
      !Array.isArray(days) ||
      !days.length ||
      days.some((day: unknown) => typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31)
    )
      throw new Error("Backup has invalid pay days");
    new Intl.DateTimeFormat("en", { timeZone: settings.timezone });
  } finally {
    source.close();
    reference.sqlite.close();
  }
}
async function copyBackup(connection: DatabaseConnection, destination: string): Promise<string> {
  const target = outputPath(destination);
  if (existsSync(target)) throw new Error("Backup destination already exists; choose a new file");
  mkdirSync(dirname(target), { recursive: true });
  const directory = mkdtempSync(join(dirname(target), ".ifm-backup-"));
  const staged = join(directory, "backup.db");
  try {
    await connection.sqlite.backup(staged);
    chmodSync(staged, 0o600);
    validateBackup(staged);
    // Hard-link publication is atomic and refuses to overwrite a racing existing file.
    linkSync(staged, target);
    return target;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
export async function backupDatabase(destination?: string): Promise<string> {
  return withExclusiveDatabase((connection) =>
    copyBackup(
      connection,
      destination ?? join(defaultFolder(connection.sqlite.name), `${uniqueName("finance")}.db`),
    ),
  );
}
export interface RestoreResult {
  databasePath: string;
  safetyBackupPath: string;
}
export async function restoreDatabase(sourcePath: string): Promise<RestoreResult> {
  return withExclusiveDatabase(async (connection) => {
    if (connection.sqlite.name === ":memory:") throw new Error("Restore requires a file-backed database");
    const target = resolve(connection.sqlite.name);
    if (realpathSync(sourcePath) === realpathSync(target))
      throw new Error("Choose a backup other than the live database");
    validateBackup(sourcePath);
    const directory = mkdtempSync(join(dirname(target), ".ifm-restore-"));
    const staged = join(directory, "restored.db");
    try {
      // SQLite backup includes a source WAL and creates a consistent standalone snapshot.
      const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
      try {
        await source.backup(staged);
      } finally {
        source.close();
      }
      chmodSync(staged, 0o600);
      validateBackup(staged);
      const safetyBackupPath = await copyBackup(
        connection,
        join(defaultFolder(target), `${uniqueName("before-restore")}.db`),
      );
      replaceHeldDatabase(staged);
      return { databasePath: target, safetyBackupPath };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
export interface CsvExportResult {
  directory: string;
  expensesPath: string;
  incomesPath: string;
}
/** Domain owns CSV formatting and spreadsheet guards; this layer owns snapshot reads and file I/O. */
export function exportCsv(directory?: string): CsvExportResult {
  return withDatabase((repos) => {
    const target = outputPath(directory ?? join(defaultFolder(), uniqueName("export")));
    const csv = repos.transaction(() => ({
      expenses: expensesToCsv(repos.expenses.list(), {
        categories: repos.categories.list(),
        paymentMethods: repos.paymentMethods.list(),
        bottles: repos.bottles.list(),
      }),
      incomes: incomesToCsv(repos.incomes.list()),
    }));
    mkdirSync(dirname(target), { recursive: true });
    mkdirSync(target, { mode: 0o700 }); // Exclusive directory: never overwrite existing exports.
    const expensesPath = join(target, "expenses.csv");
    const incomesPath = join(target, "incomes.csv");
    try {
      writeFileSync(expensesPath, csv.expenses, { encoding: "utf8", flag: "wx", mode: 0o600 });
      writeFileSync(incomesPath, csv.incomes, { encoding: "utf8", flag: "wx", mode: 0o600 });
      return { directory: target, expensesPath, incomesPath };
    } catch (error) {
      rmSync(target, { recursive: true, force: true });
      throw error;
    }
  });
}
