import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { seedDatabase } from "@/db/seed";
import {
  addExpense,
  addIncome,
  createSubscription,
  getDashboard,
  removeBottle,
  runSubscriptionAutopost,
  snapshotClosedMonths,
  updateIncome,
  type Repositories,
  type ServiceDeps,
} from "./index";

// Compile-time check: the db adapter satisfies the services' port.
type AssertPort = (r: ReturnType<typeof createRepositories>) => Repositories;
const _assertPort: AssertPort = (r) => r;
void _assertPort;

const connections: ReturnType<typeof openDatabase>[] = [];
afterEach(() => connections.splice(0).forEach((c) => c.sqlite.close()));

function setup(today = "2026-11-12"): ServiceDeps {
  const c = openDatabase(":memory:");
  connections.push(c);
  migrate(c.db, { migrationsFolder: fileURLToPath(new URL("../db/migrations", import.meta.url)) });
  seedDatabase(c.db);
  let n = 0;
  return {
    repos: createRepositories(c.db),
    clock: { today: () => today, now: () => `${today}T10:00:00.000Z`, newId: () => `id-${++n}` },
  };
}
function unwrap<T>(r: { ok: true; value: T } | { ok: false; errors: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
}

describe("services over SQLite (seeded)", () => {
  it("income → allocations → balances → expense → dashboard", () => {
    const d = setup();
    const cats = d.repos.categories.list();
    const groceries = cats.find((c) => c.name.startsWith("Groceries"))!;
    const pm = d.repos.paymentMethods.list()[0]!;
    unwrap(
      addIncome(d, {
        date: "2026-11-10",
        amountMinor: 300_001,
        currency: "USD",
        source: "Salary",
        payDaySlot: "2026-11-10",
      }),
    );
    const allocs = d.repos.allocations.list();
    expect(allocs).toHaveLength(6);
    expect(allocs.reduce((s, a) => s + a.amountMinor, 0)).toBe(300_001);
    unwrap(
      addExpense(d, {
        date: "2026-11-11",
        amountMinor: 4_500,
        currency: "USD",
        categoryId: groceries.id,
        paymentMethodId: pm.id,
      }),
    );
    const dash = getDashboard(d);
    const necessities = d.repos.bottles.list()[0]!;
    expect(dash.bottleBalances.find((b) => b.bottleId === necessities.id)?.balanceMinor).toBe(
      150_001 - 4_500,
    );
    expect(dash.pendingReminders).not.toContain("2026-11-10");
  });

  it("autopost is idempotent against the unique key", () => {
    const d = setup();
    const subs = d.repos.categories.list().find((c) => c.kind === "subscription")!;
    const pm = d.repos.paymentMethods.list()[0]!;
    unwrap(
      createSubscription(d, {
        name: "Netflix",
        amountMinor: 1599,
        currency: "USD",
        categoryId: subs.id,
        paymentMethodId: pm.id,
        billingDay: 15,
        startDate: "2026-09-01",
      }),
    );
    expect(runSubscriptionAutopost(d)).toHaveLength(2);
    expect(runSubscriptionAutopost(d)).toEqual([]);
    expect(d.repos.expenses.list().filter((e) => e.source === "subscription")).toHaveLength(2);
  });

  it("updateIncome replaces allocations atomically; removeBottle moves balance", () => {
    const d = setup();
    const inc = unwrap(
      addIncome(d, { date: "2026-11-10", amountMinor: 100_000, currency: "USD", source: "Salary" }),
    );
    unwrap(
      updateIncome(d, inc.id, { date: "2026-11-10", amountMinor: 70_000, currency: "USD", source: "Salary" }),
    );
    expect(d.repos.allocations.list().reduce((s, a) => s + a.amountMinor, 0)).toBe(70_000);
    const bottles = d.repos.bottles.list();
    const play = bottles.find((b) => b.name === "Play")!;
    const necessities = bottles[0]!;
    unwrap(removeBottle(d, play.id, necessities.id));
    expect(d.repos.bottles.list().find((b) => b.id === play.id)?.archivedAt).not.toBeNull();
    expect(d.repos.transfers.list()[0]).toMatchObject({
      fromBottleId: play.id,
      toBottleId: necessities.id,
      amountMinor: 7_000,
    });
    expect(d.repos.categories.list().some((c) => c.defaultBottleId === play.id)).toBe(false);
  });

  it("snapshots persist and reload", () => {
    const d = setup("2026-12-02");
    const food = d.repos.categories.list().find((c) => c.name.startsWith("Groceries"))!;
    const pm = d.repos.paymentMethods.list()[0]!;
    unwrap(
      addExpense(d, {
        date: "2026-11-05",
        amountMinor: 2500,
        currency: "USD",
        categoryId: food.id,
        paymentMethodId: pm.id,
      }),
    );
    expect(snapshotClosedMonths(d)).toEqual(["2026-11"]);
    expect(d.repos.monthlyReports.get("2026-11")?.totalSpendMinor).toBe(2500);
    expect(snapshotClosedMonths(d)).toEqual([]);
    // A later write dated in the closed month drops the stored snapshot (real DELETE).
    unwrap(
      addExpense(d, {
        date: "2026-11-20",
        amountMinor: 100,
        currency: "USD",
        categoryId: food.id,
        paymentMethodId: pm.id,
      }),
    );
    expect(d.repos.monthlyReports.months()).toEqual([]);
    expect(snapshotClosedMonths(d)).toEqual(["2026-11"]);
    expect(d.repos.monthlyReports.get("2026-11")?.totalSpendMinor).toBe(2600);
  });
});
