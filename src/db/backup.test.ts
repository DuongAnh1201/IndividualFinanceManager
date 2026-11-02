import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expensesToCsv, incomesToCsv } from "@/domain/csv";
import type { Expense, Income } from "@/domain/types";
import { backupDatabase, exportCsv, restoreDatabase, validateBackup } from "./backup";
import { closeDatabase, DatabaseBusyError, getDb, getRepositories, withDatabase } from "./holder";
import { createRepositories } from "./repositories";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

let directory: string;
let path: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "ifm-backup-test-"));
  path = join(directory, "live.db");
  vi.stubEnv("DATABASE_URL", path);
});
afterEach(() => {
  closeDatabase();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});
function expense(id = "expense"): Expense {
  const r = getRepositories();
  const category = r.categories.list()[0]!;
  return {
    id,
    date: "2026-11-01",
    amountMinor: 123,
    currency: "USD",
    fxRateToBase: null,
    categoryId: category.id,
    paymentMethodId: r.paymentMethods.list()[0]!.id,
    bottleId: category.defaultBottleId,
    note: '=SUM(1,2)\n"quoted"',
    source: "manual",
    subscriptionId: null,
    billingMonth: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}
function readBackup(
  file: string,
  work: (r: ReturnType<typeof createRepositories>, sqlite: Database.Database) => void,
) {
  const sqlite = new Database(file, { readonly: true, fileMustExist: true });
  try {
    work(createRepositories(drizzle(sqlite, { schema })), sqlite);
  } finally {
    sqlite.close();
  }
}
describe("managed connection and backup/restore", () => {
  it("initializes one shared connection and guards maintenance until backup finishes", async () => {
    expect(getDb()).toBe(getDb());
    expect(getRepositories()).toBe(getRepositories());
    const value = expense();
    getRepositories().expenses.insert(value);
    const pending = backupDatabase(join(directory, "snapshot.db"));
    expect(() => getDb()).toThrow(DatabaseBusyError);
    expect(() => getRepositories()).toThrow(DatabaseBusyError);
    expect(() => withDatabase(() => 42)).toThrow(DatabaseBusyError);
    expect(() => closeDatabase()).toThrow(DatabaseBusyError);
    await expect(backupDatabase(join(directory, "another.db"))).rejects.toThrow(DatabaseBusyError);
    const snapshot = await pending;
    expect(withDatabase(() => 42)).toBe(42);
    expect(statSync(snapshot).mode & 0o777).toBe(0o600);
    validateBackup(snapshot);
    readBackup(snapshot, (r) => expect(r.expenses.get(value.id)).toEqual(value));
    expect(readdirSync(directory).some((name) => name.startsWith(".ifm-"))).toBe(false);
  });
  it("restores a WAL snapshot atomically, backs up the current data and replaces holder handles", async () => {
    getDb().$client.pragma("journal_mode=WAL");
    const original = expense();
    getRepositories().expenses.insert(original);
    expect(existsSync(`${path}-wal`)).toBe(true);
    const snapshot = await backupDatabase();
    getRepositories().expenses.update({ ...original, amountMinor: 999 });
    const before = getDb();
    const pending = restoreDatabase(snapshot);
    expect(() => withDatabase(() => undefined)).toThrow(DatabaseBusyError);
    const restored = await pending;
    expect(restored.databasePath).toBe(path);
    expect(restored.safetyBackupPath).not.toBe(snapshot);
    expect(before.$client.open).toBe(false);
    expect(getDb()).not.toBe(before);
    expect(getRepositories().expenses.get(original.id)).toEqual(original);
    readBackup(restored.safetyBackupPath, (r) => expect(r.expenses.get(original.id)?.amountMinor).toBe(999));
    validateBackup(restored.safetyBackupPath);
    expect(getDb().$client.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(getDb().$client.pragma("foreign_key_check")).toEqual([]);
    expect(readdirSync(directory).some((name) => name.startsWith(".ifm-"))).toBe(false);
  });
  it("rejects corrupt, unrelated, modified-schema and invalid-history inputs without changing the live DB", async () => {
    const value = expense();
    getRepositories().expenses.insert(value);
    const live = getDb();
    const corrupt = join(directory, "corrupt.db");
    writeFileSync(corrupt, "not sqlite");
    await expect(restoreDatabase(corrupt)).rejects.toThrow();
    const unrelated = join(directory, "other.db");
    const other = new Database(unrelated);
    other.exec("CREATE TABLE other (id TEXT)");
    other.close();
    await expect(restoreDatabase(unrelated)).rejects.toThrow("schema");
    const modified = await backupDatabase(join(directory, "modified.db"));
    const extra = new Database(modified);
    extra.exec("CREATE TABLE unexpected (id TEXT)");
    extra.close();
    await expect(restoreDatabase(modified)).rejects.toThrow("schema");
    const historyFile = await backupDatabase(join(directory, "history.db"));
    const history = new Database(historyFile);
    history.exec("UPDATE __drizzle_migrations SET hash = 'wrong'");
    history.close();
    await expect(restoreDatabase(historyFile)).rejects.toThrow("history");
    expect(getDb()).toBe(live);
    expect(getRepositories().expenses.get(value.id)).toEqual(value);
    expect(existsSync(join(directory, "backups"))).toBe(false);
  });
  it("rejects FK corruption and missing settings in an otherwise matching schema", async () => {
    const value = expense();
    getRepositories().expenses.insert(value);
    const file = await backupDatabase(join(directory, "invalid-data.db"));
    const invalid = new Database(file);
    invalid.pragma("foreign_keys=OFF");
    invalid.prepare("UPDATE expense SET category_id = 'missing'").run();
    invalid.close();
    await expect(restoreDatabase(file)).rejects.toThrow("foreign keys");
    const settingsFile = await backupDatabase(join(directory, "missing-settings.db"));
    const settings = new Database(settingsFile);
    settings.exec("DELETE FROM settings");
    settings.close();
    await expect(restoreDatabase(settingsFile)).rejects.toThrow("settings");
    expect(getRepositories().expenses.get(value.id)).toEqual(value);
  });
  it("never overwrites an existing backup or the live DB, and unlocks after failure", async () => {
    const value = expense();
    getRepositories().expenses.insert(value);
    const existing = join(directory, "existing.db");
    writeFileSync(existing, "keep me");
    await expect(backupDatabase(existing)).rejects.toThrow("already exists");
    expect(readFileSync(existing, "utf8")).toBe("keep me");
    await expect(backupDatabase(path)).rejects.toThrow("already exists");
    await expect(restoreDatabase(path)).rejects.toThrow("other than the live");
    expect(getRepositories().expenses.get(value.id)).toEqual(value);
    await expect(backupDatabase(join(directory, "new.db"))).resolves.toBe(join(directory, "new.db"));
  });
  it("blocks source-tree output and supports consistent backup from an in-memory DB", async () => {
    await expect(backupDatabase("src/db/should-not-exist.db")).rejects.toThrow("under data/");
    expect(() => exportCsv("src/db/should-not-exist")).toThrow("under data/");
    closeDatabase();
    vi.stubEnv("DATABASE_URL", ":memory:");
    const file = await backupDatabase(join(directory, "memory.db"));
    validateBackup(file);
    await expect(restoreDatabase(file)).rejects.toThrow("file-backed");
  });
});

it("exports exactly the domain CSV serializers, including archived names and USD/VND minor units", () => {
  const r = getRepositories();
  const first = expense();
  r.expenses.insert(first);
  const category = r.categories.get(first.categoryId)!;
  r.categories.update({ ...category, name: "=Category, with comma", archivedAt: "2026-11-01T00:00:00.000Z" });
  const income: Income = {
    id: "income",
    date: "2026-11-01",
    amountMinor: 25000,
    currency: "VND",
    fxRateToBase: 0.00004,
    source: "+Salary",
    note: "A, B",
    payDaySlot: null,
    bottleRuleVersionId: r.ruleVersions.latest()!.id,
  };
  r.incomes.insert(income, [
    {
      id: "allocation",
      incomeId: income.id,
      bottleId: r.bottles.list()[0]!.id,
      amountMinor: income.amountMinor,
    },
  ]);
  const expectedExpenses = expensesToCsv(r.expenses.list(), {
    categories: r.categories.list(),
    paymentMethods: r.paymentMethods.list(),
    bottles: r.bottles.list(),
  });
  const expectedIncomes = incomesToCsv(r.incomes.list());
  const result = exportCsv(join(directory, "csv"));
  expect(readFileSync(result.expensesPath, "utf8")).toBe(expectedExpenses);
  expect(readFileSync(result.incomesPath, "utf8")).toBe(expectedIncomes);
  expect(expectedExpenses).toContain('"\'=Category, with comma"');
  expect(expectedExpenses).toContain("1.23,USD");
  expect(expectedIncomes).toContain("25000,VND");
  expect(expectedIncomes).toContain("'+Salary");
  expect(statSync(result.expensesPath).mode & 0o777).toBe(0o600);
  expect(() => exportCsv(result.directory)).toThrow();
  expect(readFileSync(result.expensesPath, "utf8")).toBe(expectedExpenses);
});

it("keeps the live connection and rows intact if the automatic safety backup cannot be written", async () => {
  const value = expense();
  getRepositories().expenses.insert(value);
  const source = await backupDatabase(join(directory, "restore-source.db"));
  getRepositories().expenses.update({ ...value, amountMinor: 777 });
  const before = getDb();
  writeFileSync(join(directory, "backups"), "block the backup folder");
  await expect(restoreDatabase(source)).rejects.toThrow();
  expect(getDb()).toBe(before);
  expect(before.$client.open).toBe(true);
  expect(getRepositories().expenses.get(value.id)?.amountMinor).toBe(777);
  expect(readdirSync(directory).some((name) => name.startsWith(".ifm-"))).toBe(false);
});
