import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as D from "@/domain/types";
import { allocateIncome } from "@/domain/bottleSplit";
import { removeBottle, resplitIncome } from "@/domain/bottleRules";
import { openDatabase } from "../client";
import { seedDatabase } from "../seed";
import { createRepositories } from "./index";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const connections: ReturnType<typeof openDatabase>[] = [];
const directories: string[] = [];
const now = "2026-11-01T20:00:00.000Z";
function setup(migrations = migrationsFolder, path = ":memory:") {
  const c = openDatabase(path);
  connections.push(c);
  migrate(c.db, { migrationsFolder: migrations });
  seedDatabase(c.db);
  const r = createRepositories(c.db);
  const category = r.categories.list().find((c) => c.name === "Groceries/Daily")!;
  const method = r.paymentMethods.list()[0]!;
  const rule = r.ruleVersions.latest()!;
  const expense: D.Expense = {
    id: "e1",
    date: "2026-11-01",
    amountMinor: 123,
    currency: "USD",
    fxRateToBase: null,
    categoryId: category.id,
    paymentMethodId: method.id,
    bottleId: category.defaultBottleId,
    note: null,
    source: "manual",
    subscriptionId: null,
    billingMonth: null,
    createdAt: now,
    updatedAt: now,
  };
  const income: D.Income = {
    id: "i1",
    date: "2026-11-01",
    amountMinor: 101,
    currency: "VND",
    fxRateToBase: 0.00004,
    source: "Salary",
    note: null,
    payDaySlot: null,
    bottleRuleVersionId: rule.id,
  };
  const subscription: D.Subscription = {
    id: "sub",
    name: "Test",
    amountMinor: 200,
    currency: "USD",
    categoryId: category.id,
    paymentMethodId: method.id,
    billingDay: 1,
    startDate: "2026-01-01",
    endDate: null,
    createdAt: now,
    updatedAt: now,
  };
  let serial = 0;
  const allocations = (value = income, version = rule) =>
    allocateIncome(value, version, () => `a${serial++}`);
  return { ...c, r, expense, income, subscription, rule, allocations };
}
afterEach(() => {
  connections.splice(0).forEach((c) => c.sqlite.close());
  directories.splice(0).forEach((d) => rmSync(d, { recursive: true }));
});

describe("repositories", () => {
  it("maps expense CRUD, half-open bounds and all filters, preserving creation time", () => {
    const { r, expense } = setup();
    expect(r.expenses.get("missing")).toBeUndefined();
    expect(r.expenses.insert(expense)).toEqual(expense);
    r.expenses.insert({ ...expense, id: "e2", date: "2026-12-01" });
    r.expenses.insert({ ...expense, id: "e0", date: "2026-10-31", bottleId: null });
    expect(
      r.expenses.list({
        start: "2026-11-01",
        end: "2026-12-01",
        categoryId: expense.categoryId,
        paymentMethodId: expense.paymentMethodId,
        bottleId: expense.bottleId!,
        source: "manual",
      }),
    ).toEqual([expense]);
    expect(r.expenses.list({ categoryId: "missing" })).toEqual([]);
    expect(r.expenses.list({ paymentMethodId: "missing" })).toEqual([]);
    expect(r.expenses.list({ bottleId: "missing" })).toEqual([]);
    expect(r.expenses.list({ source: "subscription" })).toEqual([]);
    const updated = r.expenses.update({
      ...expense,
      amountMinor: 500,
      createdAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2026-11-02T12:30:00+07:00",
    });
    expect(updated).toEqual({ ...expense, amountMinor: 500, updatedAt: "2026-11-02T05:30:00.000Z" });
    expect(r.expenses.delete(expense.id)).toBe(true);
    expect(r.expenses.delete(expense.id)).toBe(false);
    expect(r.expenses.update(expense)).toBeUndefined();
  });
  it("inserts subscription batches idempotently and rolls back unrelated failures", () => {
    const { r, expense, subscription } = setup();
    r.subscriptions.create(subscription);
    const charge: D.Expense = {
      ...expense,
      source: "subscription",
      subscriptionId: subscription.id,
      billingMonth: "2026-11",
    };
    expect(r.expenses.insertMany([charge, { ...charge, id: "duplicate" }])).toEqual([charge]);
    expect(r.expenses.insertMany([{ ...charge, id: "race-request" }])).toEqual([]);
    expect(r.expenses.postedChargeKeys()).toEqual(new Set(["sub|2026-11"]));
    expect(r.expenses.postedChargeKeys("missing")).toEqual(new Set());
    expect(() =>
      r.expenses.insertMany([
        { ...charge, id: "next", billingMonth: "2026-12" },
        { ...expense, id: "bad", categoryId: "missing" },
      ]),
    ).toThrow();
    expect(r.expenses.get("next")).toBeUndefined();
    expect(() => r.expenses.insertMany([{ ...expense, id: charge.id }])).toThrow();
    r.subscriptions.updatePrice(subscription.id, { amountMinor: 900, currency: "VND" }, now);
    r.subscriptions.end(subscription.id, "2026-11-01", now);
    expect(r.subscriptions.get(subscription.id)).toMatchObject({
      amountMinor: 900,
      currency: "VND",
      endDate: "2026-11-01",
    });
    expect(r.expenses.get(charge.id)?.amountMinor).toBe(123);
    expect(r.subscriptions.list()).toHaveLength(1);
  });
  it("archives lookup rows without losing history, and maps boolean/category updates", () => {
    const { r, expense } = setup();
    r.expenses.insert(expense);
    const bottle = r.bottles.list()[0]!;
    expect(r.bottles.list().map((b) => b.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    r.bottles.rename(bottle.id, "Renamed");
    r.bottles.archive(bottle.id, "2026-11-01T12:00:00-08:00");
    expect(r.bottles.get(bottle.id)).toMatchObject({ name: "Renamed", archivedAt: now });
    expect(r.bottles.active()).toHaveLength(5);
    expect(r.bottles.list(true)).toHaveLength(6);
    const category = r.categories.get(expense.categoryId)!;
    expect(
      r.categories.update({ ...category, countsTowardLivingLimit: false, defaultBottleId: null })
        ?.countsTowardLivingLimit,
    ).toBe(false);
    r.categories.archive(category.id, now);
    r.paymentMethods.archive(expense.paymentMethodId, now);
    expect(r.categories.active()).toHaveLength(10);
    expect(r.categories.list(true)).toHaveLength(11);
    expect(r.paymentMethods.active()).toHaveLength(2);
    expect(r.paymentMethods.list(true)).toHaveLength(3);
    expect(r.expenses.get(expense.id)).toEqual(expense);
  });
  it("writes income+allocations atomically, queries by date, and re-splits atomically", () => {
    const { r, income, rule, allocations } = setup();
    const initial = allocations();
    expect(r.incomes.insert(income, initial)).toEqual(income);
    expect(r.incomes.allocationsByIncomeIds([income.id])).toHaveLength(6);
    expect(r.incomes.allocationsByIncomeIds([])).toEqual([]);
    expect(r.incomes.allocationsByDateRange({ start: "2026-11-01", end: "2026-11-02" })).toHaveLength(6);
    expect(r.incomes.list({ start: "2026-10-01", end: "2026-11-01" })).toEqual([]);
    const badIncome = { ...income, id: "bad" };
    const broken = allocations(badIncome);
    broken[0] = { ...broken[0]!, bottleId: "missing" };
    expect(() => r.incomes.insert(badIncome, broken)).toThrow();
    expect(r.incomes.get("bad")).toBeUndefined();
    expect(() => r.incomes.insert(badIncome, [])).toThrow();
    const next = r.ruleVersions.insert({
      ...rule,
      id: "rule-2",
      effectiveFrom: "2026-11-01T12:00:00-08:00",
      ratios: rule.ratios
        .slice()
        .reverse()
        .map((v) => ({ ...v, ratio: 1 })),
    });
    expect(next.effectiveFrom).toBe(now);
    expect(next.ratios.map((v) => v.bottleId)).toEqual(r.bottles.list().map((b) => b.id));
    expect(r.ruleVersions.latest(now)?.id).toBe(next.id);
    expect(r.ruleVersions.latest("1960-01-01T00:00:00.000Z")).toBeUndefined();
    let serial = 100;
    const split = resplitIncome(income, next, () => `a${serial++}`);
    const invalid = split.allocations.map((a, i) => (i === 0 ? { ...a, bottleId: "missing" } : a));
    expect(() => r.incomes.replaceAllocations(split.income, invalid)).toThrow();
    expect(r.incomes.get(income.id)).toEqual(income);
    expect(r.incomes.allocationsByIncomeIds([income.id])).toEqual(
      initial.sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(r.incomes.replaceAllocations(split.income, split.allocations).bottleRuleVersionId).toBe(next.id);
    expect(r.incomes.allocationsByIncomeIds([income.id])).toHaveLength(6);
    expect(r.ruleVersions.list()[0]).toEqual(rule);
    expect(() =>
      r.ruleVersions.insert({ ...next, id: "bad-rule", ratios: [{ bottleId: "missing", ratio: 1 }] }),
    ).toThrow();
    expect(r.ruleVersions.list()).toHaveLength(2);
  });
  it("persists a domain bottle removal in one transaction with rollback", () => {
    const { r, rule } = setup();
    const bottles = r.bottles.list();
    const removed = bottles[0]!;
    const target = bottles[1]!;
    const result = removeBottle({
      bottleId: removed.id,
      bottles,
      balance: { bottleId: removed.id, balanceMinor: 100 },
      baseCurrency: "USD",
      targetBottleId: target.id,
      categories: r.categories.list(),
      currentRule: rule,
      newRuleId: "removed-rule",
      newTransferId: "transfer",
      today: "2026-11-01",
      now,
    });
    expect(() =>
      r.applyBottleRemoval({
        ...result,
        ruleVersion: { ...result.ruleVersion, ratios: [{ bottleId: "missing", ratio: 1 }] },
      }),
    ).toThrow();
    expect(r.bottles.list()).toHaveLength(6);
    expect(r.transfers.list()).toEqual([]);
    expect(r.ruleVersions.list()).toHaveLength(1);
    expect(r.categories.list().filter((c) => c.defaultBottleId === removed.id).length).toBeGreaterThan(0);
    r.applyBottleRemoval(result);
    expect(r.bottles.get(removed.id)?.archivedAt).toBe(now);
    expect(r.categories.list().some((c) => c.defaultBottleId === removed.id)).toBe(false);
    expect(r.ruleVersions.list()[0]).toEqual(rule);
    expect(r.ruleVersions.latest()?.ratios).toHaveLength(5);
    expect(r.transfers.list({ start: "2026-11-01", end: "2026-11-02" })).toEqual([result.transfer]);
    expect(r.transfers.list({ start: "2026-10-01", end: "2026-11-01" })).toEqual([]);
  });
  it("upserts settings, rates and living limits without duplicate keys", () => {
    const { r } = setup();
    const settings = {
      baseCurrency: "VND" as const,
      payDays: [5, 20],
      weekStartsOn: 0 as const,
      timezone: "Asia/Ho_Chi_Minh",
    };
    expect(r.settings.update(settings)).toEqual(settings);
    expect(() => r.settings.update({ ...settings, payDays: [32] })).toThrow();
    expect(() => r.settings.update({ ...settings, timezone: "invalid-zone" })).toThrow();
    r.exchangeRates.upsert({ month: "2026-11", currency: "VND", rateToBase: 0.00004 });
    r.exchangeRates.upsert({ month: "2026-11", currency: "VND", rateToBase: 0.00005 });
    expect(r.exchangeRates.get("2026-11", "VND")?.rateToBase).toBe(0.00005);
    expect(r.exchangeRates.get("2026-10", "VND")).toBeUndefined();
    expect(r.exchangeRates.list(["2026-11"])).toHaveLength(1);
    expect(r.exchangeRates.list([])).toEqual([]);
    r.livingLimits.upsert({ month: "2026-11", limitMinor: 0 });
    r.livingLimits.upsert({ month: "2026-11", limitMinor: 100 });
    expect(r.livingLimits.list()).toEqual([{ month: "2026-11", limitMinor: 100 }]);
  });
  it("cycles seed colors and uses descriptive payment method names", () => {
    const { r, db } = setup();
    expect(new Set(r.categories.list().map((c) => c.color)).size).toBe(7);
    expect(
      r.paymentMethods
        .list()
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Cash", "Credit card", "Debit card"]);
    seedDatabase(db, "UTC");
    expect(r.settings.get()?.timezone).toBe("America/Los_Angeles");
  });
  it("upgrades a populated v1 database preserving allocations and subscription history", () => {
    const directory = mkdtempSync(join(tmpdir(), "ifm-upgrade-"));
    directories.push(directory);
    mkdirSync(join(directory, "meta"));
    const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"));
    journal.entries = journal.entries.slice(0, 1);
    writeFileSync(join(directory, "meta/_journal.json"), JSON.stringify(journal));
    copyFileSync(join(migrationsFolder, "0000_jittery_pixie.sql"), join(directory, "0000_jittery_pixie.sql"));
    const { db, r, sqlite, income, allocations, subscription, expense } = setup(directory);
    r.incomes.insert(income, allocations());
    r.subscriptions.create(subscription);
    r.expenses.insert({
      ...expense,
      source: "subscription",
      subscriptionId: subscription.id,
      billingMonth: "2026-11",
    });
    // A late failure must roll back earlier table rebuilds and all temporary copies.
    sqlite.prepare("UPDATE subscription SET currency = 'EUR'").run();
    expect(() => migrate(db, { migrationsFolder })).toThrow();
    expect(r.incomes.get(income.id)).toEqual(income);
    expect(r.incomes.allocationsByIncomeIds([income.id])).toHaveLength(6);
    expect(
      sqlite.prepare("SELECT name FROM sqlite_temp_master WHERE name LIKE '__currency_%'").all(),
    ).toEqual([]);
    sqlite.prepare("UPDATE subscription SET currency = 'USD'").run();
    migrate(db, { migrationsFolder });
    expect(r.incomes.get(income.id)).toEqual(income);
    expect(r.incomes.allocationsByIncomeIds([income.id])).toHaveLength(6);
    expect(r.expenses.postedChargeKeys().size).toBe(1);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    for (const table of ["expense", "subscription", "income", "bottle_transfer", "exchange_rate"]) {
      expect(sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(table)).toMatchObject({
        sql: expect.stringContaining("IN ('USD','VND')"),
      });
    }
    expect(() => sqlite.prepare("UPDATE expense SET currency = 'EUR'").run()).toThrow();
    expect(() => sqlite.prepare("UPDATE settings SET base_currency = 'EUR'").run()).toThrow();
  });
});
