import { afterEach, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import type { MonthlyReport, Income, BottleAllocation } from "@/domain/types";
import { openDatabase } from "../client";
import { seedDatabase } from "../seed";
import { createRepositories } from "./index";

const connections: ReturnType<typeof openDatabase>[] = [];
afterEach(() => connections.splice(0).forEach((c) => c.sqlite.close()));
function setup() {
  const c = openDatabase(":memory:");
  connections.push(c);
  migrate(c.db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
  seedDatabase(c.db);
  const r = createRepositories(c.db);
  const income: Income = {
    id: "service-income",
    date: "2026-11-01",
    amountMinor: 100,
    currency: "USD",
    fxRateToBase: null,
    source: "Test",
    note: null,
    payDaySlot: null,
    bottleRuleVersionId: r.ruleVersions.latest()!.id,
  };
  const rows: BottleAllocation[] = [
    { id: "a", incomeId: income.id, bottleId: r.bottles.list()[0]!.id, amountMinor: 100 },
  ];
  return { ...c, r, income, rows };
}
it("supports service orchestration through nested transactions with rollback", () => {
  const { r, income, rows } = setup();
  expect(() =>
    r.transaction(() => {
      r.incomes.insert(income);
      r.transaction(() => r.allocations.insertMany(rows));
      r.reminders.upsert({ slot: "2026-11-10", status: "done", resolvedAt: "2026-11-10T12:00:00-08:00" });
      throw new Error("fail after nested writes");
    }),
  ).toThrow("fail after nested writes");
  expect(r.incomes.list()).toEqual([]);
  expect(r.allocations.list()).toEqual([]);
  expect(r.reminders.list()).toEqual([]);
  expect(
    r.transaction(() => {
      r.incomes.insert(income);
      r.allocations.insertMany(rows);
      return 42;
    }),
  ).toBe(42);
  const nextRows = [{ ...rows[0]!, id: "a2" }];
  r.transaction(() => {
    r.incomes.update({ ...income, note: "Updated" });
    r.allocations.replaceForIncome(income.id, nextRows);
  });
  expect(r.incomes.get(income.id)?.note).toBe("Updated");
  expect(r.allocations.list()).toEqual(nextRows);
  expect(() =>
    r.transaction(() => {
      r.incomes.update({ ...income, note: "Should roll back" });
      r.allocations.replaceForIncome(income.id, [{ ...nextRows[0]!, bottleId: "missing" }]);
    }),
  ).toThrow();
  expect(r.incomes.get(income.id)?.note).toBe("Updated");
  expect(r.allocations.list()).toEqual(nextRows);
  r.allocations.deleteForIncome(income.id);
  expect(r.allocations.list()).toEqual([]);
  r.allocations.insertMany(nextRows);
  expect(r.incomes.delete(income.id)).toBe(true);
  expect(r.allocations.list()).toEqual([]);
  expect(r.incomes.delete(income.id)).toBe(false);
});
it("updates income and replaces allocations atomically via the combined API", () => {
  const { r, income, rows } = setup();
  r.incomes.insert(income, rows);
  const updated = { ...income, amountMinor: 150 };
  expect(() => r.incomes.update(updated, [{ ...rows[0]!, bottleId: "missing", amountMinor: 150 }])).toThrow();
  expect(r.incomes.get(income.id)).toEqual(income);
  expect(r.allocations.list()).toEqual(rows);
  expect(r.incomes.update(updated, [{ ...rows[0]!, amountMinor: 150 }])).toEqual(updated);
  expect(r.allocations.list()[0]?.amountMinor).toBe(150);
});
it("returns archived lookup rows to services and supports active-only pickers", () => {
  const { r } = setup();
  const bottle = r.bottles.list()[0]!;
  r.bottles.archive(bottle.id, "2026-11-01T00:00:00.000Z");
  expect(r.bottles.list()).toHaveLength(6);
  expect(r.bottles.active()).toHaveLength(5);
  expect(r.bottles.list(false)).toEqual(r.bottles.active());
});
it("persists report snapshots, months and reminders with normalized timestamps", () => {
  const { r, sqlite } = setup();
  const report: MonthlyReport = {
    month: "2026-10",
    baseCurrency: "USD",
    totalSpendMinor: 123,
    byCategory: [],
    byPaymentMethod: [],
    byPaymentType: { cash: 123, debit: 0, credit: 0 },
    byKind: { daily: 123, subscription: 0, other: 0 },
    incomeTotalMinor: 200,
    bottleAllocations: [],
    bottleBalances: [],
    livingLimit: null,
    topExpenses: [],
    deltaVsPreviousMinor: null,
    missingRateExpenseIds: [],
    missingRateIncomeIds: [],
  };
  r.monthlyReports.upsert(report.month, report, "2026-11-01T12:00:00-08:00");
  expect(r.monthlyReports.get(report.month)).toEqual(report);
  expect(r.monthlyReports.get("missing")).toBeUndefined();
  r.monthlyReports.upsert(report.month, { ...report, totalSpendMinor: 200 }, "2026-11-02T00:00:00Z");
  expect(r.monthlyReports.months()).toEqual([report.month]);
  expect(sqlite.prepare("SELECT generated_at FROM monthly_report").get()).toEqual({
    generated_at: "2026-11-02T00:00:00.000Z",
  });
  expect(() => r.monthlyReports.upsert("2026-09", report, "2026-11-01T00:00:00Z")).toThrow();
  r.reminders.upsert({ slot: "2026-11-10", status: "pending", resolvedAt: null });
  r.reminders.upsert({ slot: "2026-11-10", status: "done", resolvedAt: "2026-11-10T12:00:00-08:00" });
  expect(r.reminders.list()).toEqual([
    { slot: "2026-11-10", status: "done", resolvedAt: "2026-11-10T20:00:00.000Z" },
  ]);
  r.reminders.delete("2026-11-10");
  expect(r.reminders.list()).toEqual([]);
  expect(r.livingLimits.get("2026-11")).toBeUndefined();
});
it("requires seed settings and rejects invalid timestamps before writing", () => {
  const c = openDatabase(":memory:");
  connections.push(c);
  migrate(c.db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
  const r = createRepositories(c.db);
  expect(() => r.settings.get()).toThrow("Settings missing");
  seedDatabase(c.db);
  expect(() => r.bottles.archive(r.bottles.list()[0]!.id, "nonsense")).toThrow("Invalid timestamp");
  expect(r.bottles.active()).toHaveLength(6);
});
