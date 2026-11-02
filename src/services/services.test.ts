import { describe, expect, it } from "vitest";
import {
  addExpense,
  addIncome,
  changeSubscriptionPrice,
  createSubscription,
  deleteExpense,
  deleteIncome,
  dismissReminder,
  editBottleRules,
  editExpense,
  endSubscription,
  getDashboard,
  getMonthlyReport,
  getPendingReminders,
  removeBottle,
  removeSubscription,
  resplitIncome,
  runSubscriptionAutopost,
  snapshotClosedMonths,
  updateIncome,
  updateSubscription,
} from "./index";
import { makeDeps } from "./testing/fakes";

const expenseInput = {
  date: "2026-11-05",
  amountMinor: 2500,
  currency: "USD",
  categoryId: "food",
  paymentMethodId: "pm1",
};
const incomeInput = { date: "2026-11-10", amountMinor: 100_000, currency: "USD", source: "Salary" };
const subInput = {
  name: "Netflix",
  amountMinor: 1599,
  currency: "USD",
  categoryId: "subs",
  paymentMethodId: "pm1",
  billingDay: 15,
  startDate: "2026-09-01",
};
function unwrap<T>(r: { ok: true; value: T } | { ok: false; errors: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
}

describe("expenses", () => {
  it("adds with category's default bottle and timestamps", () => {
    const d = makeDeps();
    const e = unwrap(addExpense(d, expenseInput));
    expect(e).toMatchObject({ source: "manual", bottleId: "N", subscriptionId: null, billingMonth: null });
    expect(d.store.expenses).toHaveLength(1);
  });

  it("returns validation errors and saves nothing", () => {
    const d = makeDeps();
    const r = addExpense(d, { ...expenseInput, amountMinor: 0, categoryId: "nope" });
    expect(r.ok).toBe(false);
    expect(d.store.expenses).toHaveLength(0);
  });

  it("edit keeps subscription linkage; delete blocks subscription charges", () => {
    const d = makeDeps();
    unwrap(createSubscription(d, subInput));
    const posted = runSubscriptionAutopost(d, "2026-11-12");
    const charge = posted[0]!;
    const edited = unwrap(
      editExpense(d, charge.id, {
        ...expenseInput,
        date: charge.date,
        categoryId: "subs",
        amountMinor: 1700,
        note: "hi",
      }),
    );
    expect(edited.amountMinor).toBe(1700);
    expect(editExpense(d, charge.id, { ...expenseInput, date: "2026-10-20", categoryId: "subs" }).ok).toBe(
      false,
    );
    expect(editExpense(d, charge.id, { ...expenseInput, date: charge.date, categoryId: "food" }).ok).toBe(
      false,
    );
    expect(edited).toMatchObject({
      source: "subscription",
      subscriptionId: charge.subscriptionId,
      billingMonth: charge.billingMonth,
      createdAt: charge.createdAt,
    });
    const del = deleteExpense(d, charge.id);
    expect(del.ok).toBe(false);
    expect(d.store.expenses).toContainEqual(expect.objectContaining({ id: charge.id }));
  });

  it("deletes manual expenses; unknown ids are not-found", () => {
    const d = makeDeps();
    const e = unwrap(addExpense(d, expenseInput));
    unwrap(deleteExpense(d, e.id));
    expect(d.store.expenses).toHaveLength(0);
    const r = deleteExpense(d, "zzz");
    expect(!r.ok && r.errors[0]?.code).toBe("not-found");
    expect(editExpense(d, "zzz", expenseInput).ok).toBe(false);
  });
});

describe("income", () => {
  it("splits with the active rule, stores allocations, resolves the pay-day reminder", () => {
    const d = makeDeps();
    const inc = unwrap(addIncome(d, { ...incomeInput, amountMinor: 100_003, payDaySlot: "2026-11-10" }));
    expect(inc.bottleRuleVersionId).toBe("v1");
    const allocs = d.store.allocations.filter((a) => a.incomeId === inc.id);
    expect(allocs.map((a) => a.amountMinor)).toEqual([50_003, 10_000, 10_000, 10_000, 10_000, 10_000]);
    expect(allocs.reduce((s, a) => s + a.amountMinor, 0)).toBe(100_003);
    expect(d.store.reminders).toEqual([expect.objectContaining({ slot: "2026-11-10", status: "done" })]);
  });

  it("rejects invalid input without writing anything", () => {
    const d = makeDeps();
    expect(addIncome(d, { ...incomeInput, source: " " }).ok).toBe(false);
    expect(d.store.incomes).toHaveLength(0);
    expect(d.store.allocations).toHaveLength(0);
  });

  it("is atomic: a failure mid-way rolls everything back", () => {
    const d = makeDeps();
    d.repos.reminders.upsert = () => {
      throw new Error("boom");
    };
    expect(() => addIncome(d, { ...incomeInput, payDaySlot: "2026-11-10" })).toThrow("boom");
    expect(d.store.incomes).toHaveLength(0);
    expect(d.store.allocations).toHaveLength(0);
  });

  it("update keeps the historical rule version and replaces allocations", () => {
    const d = makeDeps();
    const inc = unwrap(addIncome(d, incomeInput));
    unwrap(
      editBottleRules(d, [
        { bottleId: "N", ratio: 1 },
        { bottleId: "P", ratio: 1 },
      ]),
    );
    const upd = unwrap(updateIncome(d, inc.id, { ...incomeInput, amountMinor: 70_000 }));
    expect(upd.bottleRuleVersionId).toBe("v1");
    const allocs = d.store.allocations.filter((a) => a.incomeId === inc.id);
    expect(allocs).toHaveLength(6);
    expect(allocs.reduce((s, a) => s + a.amountMinor, 0)).toBe(70_000);
    expect(updateIncome(d, "zzz", incomeInput).ok).toBe(false);
  });

  it("resplit applies the current rule", () => {
    const d = makeDeps({ now: "2026-11-12T10:00:00.000Z" });
    const inc = unwrap(addIncome(d, incomeInput));
    const v2 = unwrap(
      editBottleRules(d, [
        { bottleId: "N", ratio: 1 },
        { bottleId: "P", ratio: 1 },
      ]),
    );
    const out = unwrap(resplitIncome(d, inc.id));
    expect(out.bottleRuleVersionId).toBe(v2.id);
    expect(d.store.allocations.filter((a) => a.incomeId === inc.id).map((a) => a.amountMinor)).toEqual([
      50_000, 50_000,
    ]);
  });

  it("delete removes allocations and reopens the slot unless another income resolves it", () => {
    const d = makeDeps();
    const a = unwrap(addIncome(d, { ...incomeInput, payDaySlot: "2026-11-10" }));
    const b = unwrap(addIncome(d, { ...incomeInput, payDaySlot: "2026-11-10" }));
    unwrap(deleteIncome(d, a.id));
    expect(d.store.allocations.every((x) => x.incomeId === b.id)).toBe(true);
    expect(d.store.reminders).toHaveLength(1);
    unwrap(deleteIncome(d, b.id));
    expect(d.store.allocations).toHaveLength(0);
    expect(d.store.reminders).toHaveLength(0);
    expect(deleteIncome(d, "zzz").ok).toBe(false);
  });
});

describe("subscriptions", () => {
  it("autopost catches up, is idempotent, and honours remove (D-017)", () => {
    const d = makeDeps();
    const sub = unwrap(createSubscription(d, subInput));
    const first = runSubscriptionAutopost(d, "2026-11-12");
    expect(first.map((e) => e.billingMonth)).toEqual(["2026-09", "2026-10"]);
    expect(runSubscriptionAutopost(d, "2026-11-12")).toEqual([]);
    unwrap(removeSubscription(d, sub.id));
    expect(d.store.subscriptions[0]?.endDate).toBe("2026-11-12");
    expect(runSubscriptionAutopost(d, "2026-12-20").map((e) => e.billingMonth)).toEqual([]);
    expect(d.store.expenses).toHaveLength(2);
  });

  it("autopost race: a charge already inserted by someone else is skipped, not an error", () => {
    const d = makeDeps();
    unwrap(createSubscription(d, subInput));
    const real = d.repos.expenses.postedChargeKeys;
    d.repos.expenses.postedChargeKeys = () => new Set(); // stale read: another run posted meanwhile
    const first = runSubscriptionAutopost(d, "2026-10-20");
    expect(first).toHaveLength(2);
    const again = runSubscriptionAutopost(d, "2026-10-20");
    expect(again).toEqual([]);
    expect(d.store.expenses).toHaveLength(2);
    d.repos.expenses.postedChargeKeys = real;
  });

  it("price change affects only later charges; update/end validate", () => {
    const d = makeDeps();
    const sub = unwrap(createSubscription(d, subInput));
    runSubscriptionAutopost(d, "2026-10-20");
    unwrap(changeSubscriptionPrice(d, sub.id, 1999));
    runSubscriptionAutopost(d, "2026-11-20");
    expect(d.store.expenses.map((e) => e.amountMinor)).toEqual([1599, 1599, 1999]);
    expect(changeSubscriptionPrice(d, sub.id, 0).ok).toBe(false);
    expect(updateSubscription(d, sub.id, { ...subInput, billingDay: 40 }).ok).toBe(false);
    expect(unwrap(updateSubscription(d, sub.id, { ...subInput, name: "Hulu", billingDay: 20 })).name).toBe(
      "Hulu",
    );
    expect(unwrap(endSubscription(d, sub.id, "2026-12-01")).endDate).toBe("2026-12-01");
    expect(createSubscription(d, { ...subInput, categoryId: "x" }).ok).toBe(false);
    expect(endSubscription(d, "zzz").ok).toBe(false);
  });
});

describe("bottles", () => {
  it("editBottleRules saves a new version, rejects archived/unknown bottles and bad ratios", () => {
    const d = makeDeps();
    const v = unwrap(
      editBottleRules(
        d,
        [
          { bottleId: "P", ratio: 2 },
          { bottleId: "N", ratio: 3 },
        ],
        "tweak",
      ),
    );
    expect(d.store.ruleVersions).toHaveLength(2);
    expect(v.ratios.map((r) => r.bottleId)).toEqual(["N", "P"]);
    expect(editBottleRules(d, [{ bottleId: "X", ratio: 1 }]).ok).toBe(false);
    expect(editBottleRules(d, [{ bottleId: "N", ratio: 0 }]).ok).toBe(false);
    expect(d.store.ruleVersions).toHaveLength(2);
  });

  it("removeBottle: transfers balance, repoints categories, archives, new rule — atomically", () => {
    const d = makeDeps();
    unwrap(addIncome(d, incomeInput)); // P gets 10_000
    unwrap(addExpense(d, { ...expenseInput, categoryId: "fun", amountMinor: 1000 })); // P -1000
    expect(removeBottle(d, "P").ok).toBe(false); // needs a target
    expect(d.store.bottles.find((b) => b.id === "P")?.archivedAt).toBeNull();
    const r = unwrap(removeBottle(d, "P", "N"));
    expect(r.transferred).toBe(true);
    expect(d.store.transfers[0]).toMatchObject({ fromBottleId: "P", toBottleId: "N", amountMinor: 9000 });
    expect(d.store.categories.find((c) => c.id === "fun")?.defaultBottleId).toBe("N");
    expect(d.store.bottles.find((b) => b.id === "P")?.archivedAt).not.toBeNull();
    expect(d.store.ruleVersions.at(-1)?.ratios.some((x) => x.bottleId === "P")).toBe(false);
    expect(removeBottle(d, "zzz", "N").ok).toBe(false);
  });
});

describe("reminders & dashboard", () => {
  it("lists pending, dismisses", () => {
    const d = makeDeps({ today: "2026-11-26" });
    expect(getPendingReminders(d, "2026-11-01")).toEqual(["2026-11-10", "2026-11-25"]);
    dismissReminder(d, "2026-11-10");
    expect(getPendingReminders(d, "2026-11-01")).toEqual(["2026-11-25"]);
  });

  it("dashboard: living limit, balances, pending slots, upcoming subs", () => {
    const d = makeDeps({ today: "2026-11-12" });
    d.store.livingLimits.push({ month: "2026-11", limitMinor: 10_000 });
    unwrap(addIncome(d, { ...incomeInput, payDaySlot: "2026-11-10" }));
    unwrap(addExpense(d, { ...expenseInput, amountMinor: 8_500 }));
    unwrap(createSubscription(d, { ...subInput, startDate: "2026-11-01" }));
    const dash = getDashboard(d);
    expect(dash.month).toBe("2026-11");
    expect(dash.livingLimit).toMatchObject({ spentMinor: 8_500, status: "warning" });
    expect(dash.bottleBalances.find((b) => b.bottleId === "N")?.balanceMinor).toBe(50_000 - 8_500);
    expect(dash.pendingReminders).toEqual(["2026-10-10", "2026-10-25"]);
    expect(dash.upcomingSubscriptions.map((u) => u.nextChargeDate)).toEqual(["2026-11-15"]);
  });
});

describe("reports", () => {
  it("snapshots ended months once, and serves snapshots for closed months", () => {
    const d = makeDeps({ today: "2026-12-02" });
    unwrap(addExpense(d, expenseInput));
    expect(snapshotClosedMonths(d)).toEqual(["2026-11"]);
    expect(snapshotClosedMonths(d)).toEqual([]);
    d.store.reports.get("2026-11")!.report.totalSpendMinor = 123;
    expect(getMonthlyReport(d, "2026-11").totalSpendMinor).toBe(123);
    expect(getMonthlyReport(d, "2026-12").totalSpendMinor).toBe(0);
  });

  it("snapshots and closed-month reports use month-end bottle balances, not current ones", () => {
    const d = makeDeps({ today: "2026-12-20" });
    unwrap(addIncome(d, { ...incomeInput, date: "2026-11-10" })); // N +50_000 in Nov
    unwrap(addIncome(d, { ...incomeInput, date: "2026-12-10" })); // N +50_000 in Dec
    unwrap(addExpense(d, { ...expenseInput, date: "2026-12-05", amountMinor: 7_000 })); // N -7_000 in Dec
    const nov = (r: ReturnType<typeof getMonthlyReport>) =>
      r.bottleBalances.find((b) => b.bottleId === "N")?.balanceMinor;
    expect(nov(getMonthlyReport(d, "2026-11"))).toBe(50_000);
    snapshotClosedMonths(d);
    expect(nov(d.store.reports.get("2026-11")!.report)).toBe(50_000);
    // The current month reflects everything up to its end.
    expect(nov(getMonthlyReport(d, "2026-12"))).toBe(50_000 + 50_000 - 7_000);
  });

  it("snapshot with no data writes nothing", () => {
    expect(snapshotClosedMonths(makeDeps())).toEqual([]);
  });
});
