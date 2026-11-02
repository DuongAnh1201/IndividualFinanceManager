import { afterEach, describe, expect, it } from "vitest";
import {
  addExpense,
  addIncome,
  changeSubscriptionPrice,
  createSubscription,
  endSubscription,
  getComparison,
  getMonthlyReport,
  getPendingReminders,
  removeBottle,
  runSubscriptionAutopost,
  snapshotClosedMonths,
} from "./index";
import { errorCodes, openSeeded, refs, unwrap, type Seeded } from "./testing/sqlite";

const open: Seeded[] = [];
function setup(today?: string) {
  const s = openSeeded(today);
  open.push(s);
  return { ...s, d: s.deps, r: refs(s.repos) };
}
afterEach(() => open.splice(0).forEach((s) => s.close()));

const salary = (o: Record<string, unknown> = {}) => ({
  date: "2026-11-10",
  amountMinor: 100_000,
  currency: "USD",
  source: "Salary",
  ...o,
});

describe("income split + pay-day reminders (BR-3, BR-5)", () => {
  it("splits 5:1:1:1:1:1 with the remainder going to the first bottle", () => {
    const { d, r, repos } = setup();
    unwrap(addIncome(d, salary({ amountMinor: 100_003 })));
    const byBottle = new Map(repos.allocations.list().map((a) => [a.bottleId, a.amountMinor]));
    expect(byBottle.size).toBe(6);
    expect(byBottle.get(r.bottle("Necessities").id)).toBe(50_003); // 50_001 + remainder 2
    for (const name of ["Long-term Savings", "Financial Freedom", "Education", "Play", "Give"]) {
      expect(byBottle.get(r.bottle(name).id)).toBe(10_000);
    }
    expect([...byBottle.values()].reduce((a, b) => a + b, 0)).toBe(100_003);
  });

  it("records the active rule version on the income", () => {
    const { d, repos } = setup();
    const income = unwrap(addIncome(d, salary()));
    expect(income.bottleRuleVersionId).toBe(repos.ruleVersions.latest()!.id);
  });

  it("resolves a pay-day slot via payDaySlot, and by date window when none is given", () => {
    const { d } = setup("2026-11-27");
    expect(getPendingReminders(d, "2026-11-01")).toEqual(["2026-11-10", "2026-11-25"]);
    unwrap(addIncome(d, salary({ payDaySlot: "2026-11-10" })));
    expect(getPendingReminders(d, "2026-11-01")).toEqual(["2026-11-25"]);
    unwrap(addIncome(d, salary({ date: "2026-11-26" })));
    expect(getPendingReminders(d, "2026-11-01")).toEqual([]);
  });

  it("splits a VND income in VND using the month's rate", () => {
    const { d, repos } = setup();
    repos.exchangeRates.upsert({ month: "2026-11", currency: "VND", rateToBase: 0.00004 });
    const income = unwrap(addIncome(d, salary({ currency: "VND", amountMinor: 25_000_001 })));
    expect(income.fxRateToBase).toBe(0.00004);
    const total = repos.allocations.list().reduce((a, x) => a + x.amountMinor, 0);
    expect(total).toBe(25_000_001);
  });

  it("a rejected income writes nothing (no rate for VND)", () => {
    const { d, count } = setup();
    const r = addIncome(d, salary({ currency: "VND", amountMinor: 1_000_000, payDaySlot: "2026-11-10" }));
    expect(errorCodes(r)).toEqual(["missing-fx-rate"]);
    expect([count("income"), count("bottle_allocation"), count("reminder")]).toEqual([0, 0, 0]);
  });
});

describe("expense validation + bottle defaulting (BR-2)", () => {
  const base = (r: ReturnType<typeof setup>["r"], o: Record<string, unknown> = {}) => ({
    date: "2026-11-05",
    amountMinor: 1_250,
    currency: "USD",
    categoryId: r.category("Groceries").id,
    paymentMethodId: r.method("debit").id,
    ...o,
  });

  it("defaults the bottle from the category and honours an explicit one", () => {
    const { d, r, repos } = setup();
    const dining = unwrap(addExpense(d, base(r, { categoryId: r.category("Dining").id })));
    expect(dining.bottleId).toBe(r.bottle("Play").id);
    const explicit = unwrap(addExpense(d, base(r, { bottleId: r.bottle("Give").id })));
    expect(explicit.bottleId).toBe(r.bottle("Give").id);
    expect(repos.expenses.get(dining.id)?.bottleId).toBe(r.bottle("Play").id);
  });

  it("rejects bad input and writes nothing", () => {
    const { d, r, count } = setup();
    expect(errorCodes(addExpense(d, base(r, { amountMinor: 0 })))).toEqual(["invalid-amount"]);
    expect(errorCodes(addExpense(d, base(r, { categoryId: "nope" })))).toEqual(["unknown-category"]);
    expect(errorCodes(addExpense(d, base(r, { currency: "VND" })))).toEqual(["missing-fx-rate"]);
    expect(count("expense")).toBe(0);
  });

  it("archived category is rejected for new expenses; archived default bottle gives null", () => {
    const { d, r, repos } = setup();
    const play = r.bottle("Play");
    repos.bottles.archive(play.id, "2026-11-01T00:00:00.000Z");
    const dining = unwrap(addExpense(d, base(r, { categoryId: r.category("Dining").id })));
    expect(dining.bottleId).toBeNull();
    const shopping = r.category("Shopping");
    repos.categories.archive(shopping.id, "2026-11-01T00:00:00.000Z");
    expect(errorCodes(addExpense(d, base(r, { categoryId: shopping.id })))).toEqual(["archived-category"]);
  });
});

describe("subscription autopost (BR-1)", () => {
  const sub = (r: ReturnType<typeof setup>["r"], o: Record<string, unknown> = {}) => ({
    name: "Netflix",
    amountMinor: 1_599,
    currency: "USD",
    categoryId: r.category("Subscriptions").id,
    paymentMethodId: r.method("credit").id,
    billingDay: 31,
    startDate: "2026-01-31",
    ...o,
  });
  const dates = (repos: ReturnType<typeof setup>["repos"]) =>
    repos.expenses
      .list()
      .filter((e) => e.source === "subscription")
      .map((e) => e.date)
      .sort();

  it("catches up, clamps to month end, and is idempotent", () => {
    const { d, r, repos } = setup("2026-03-01");
    unwrap(createSubscription(d, sub(r)));
    expect(runSubscriptionAutopost(d)).toHaveLength(2);
    expect(dates(repos)).toEqual(["2026-01-31", "2026-02-28"]);
    expect(runSubscriptionAutopost(d)).toEqual([]);
    expect(runSubscriptionAutopost(d, "2026-03-01")).toEqual([]);
    expect(dates(repos)).toHaveLength(2);
  });

  it("clamps to Feb 29 in a leap year", () => {
    const { d, r, repos } = setup("2024-03-01");
    unwrap(createSubscription(d, sub(r, { startDate: "2024-01-31" })));
    runSubscriptionAutopost(d);
    expect(dates(repos)).toEqual(["2024-01-31", "2024-02-29"]);
  });

  it("posted charges carry source, link, billing month and the category's default bottle", () => {
    const { d, r } = setup("2026-02-01");
    const s = unwrap(createSubscription(d, sub(r, { billingDay: 1, startDate: "2026-02-01" })));
    const [e] = runSubscriptionAutopost(d);
    expect(e).toMatchObject({
      source: "subscription",
      subscriptionId: s.id,
      billingMonth: "2026-02",
      bottleId: r.bottle("Necessities").id,
      amountMinor: 1_599,
    });
  });

  it("a price change only affects later charges; ending stops future posts", () => {
    const { d, r, repos } = setup("2026-02-15");
    const s = unwrap(createSubscription(d, sub(r, { billingDay: 10, startDate: "2026-01-01" })));
    runSubscriptionAutopost(d);
    unwrap(changeSubscriptionPrice(d, s.id, 2_000));
    expect(runSubscriptionAutopost(d, "2026-03-15").map((e) => e.amountMinor)).toEqual([2_000]);
    const amounts = repos.expenses.list().map((e) => e.amountMinor);
    expect(amounts.filter((a) => a === 1_599)).toHaveLength(2);
    unwrap(endSubscription(d, s.id, "2026-03-20"));
    expect(runSubscriptionAutopost(d, "2026-06-01")).toEqual([]);
  });
});

describe("removeBottle is atomic (BR-4, D-018)", () => {
  it("transfers the balance, archives the bottle, repoints categories, adds a rule version", () => {
    const { d, r, repos } = setup();
    const income = unwrap(addIncome(d, salary()));
    const play = r.bottle("Play");
    const necessities = r.bottle("Necessities");
    unwrap(removeBottle(d, play.id, necessities.id));

    expect(repos.bottles.get(play.id)?.archivedAt).not.toBeNull();
    expect(repos.transfers.list()).toMatchObject([
      { fromBottleId: play.id, toBottleId: necessities.id, amountMinor: 10_000 },
    ]);
    expect(repos.categories.list().filter((c) => c.defaultBottleId === play.id)).toEqual([]);
    expect(r.category("Dining").defaultBottleId).toBe(necessities.id);

    const latest = repos.ruleVersions.latest()!;
    expect(latest.id).not.toBe(income.bottleRuleVersionId);
    expect(latest.ratios.map((x) => x.bottleId)).not.toContain(play.id);
    expect(latest.ratios).toHaveLength(5);
    // history is untouched
    expect(repos.allocations.list()).toHaveLength(6);
    expect(repos.incomes.get(income.id)?.bottleRuleVersionId).toBe(income.bottleRuleVersionId);
  });

  it("refusing without a target for a non-empty bottle writes nothing", () => {
    const { d, r, count, repos } = setup();
    unwrap(addIncome(d, salary()));
    const versions = count("bottle_rule_version");
    const result = removeBottle(d, r.bottle("Play").id);
    expect(result.ok).toBe(false);
    expect(repos.bottles.get(r.bottle("Play").id)?.archivedAt).toBeNull();
    expect([count("bottle_transfer"), count("bottle_rule_version")]).toEqual([0, versions]);
  });

  it("refuses when the balance has rows without an exchange rate (lead decision #4)", () => {
    const { d, r, repos, count } = setup();
    const play = r.bottle("Play");
    repos.incomes.insert(
      {
        id: "vnd-income",
        date: "2026-09-10",
        amountMinor: 1_000_000,
        currency: "VND",
        fxRateToBase: null,
        source: "Salary",
        note: null,
        payDaySlot: null,
        bottleRuleVersionId: repos.ruleVersions.latest()!.id,
      },
      [{ id: "vnd-alloc", incomeId: "vnd-income", bottleId: play.id, amountMinor: 1_000_000 }],
    );
    const result = removeBottle(d, play.id, r.bottle("Necessities").id);
    expect(errorCodes(result)).toEqual(["missing-rate"]);
    expect(repos.bottles.get(play.id)?.archivedAt).toBeNull();
    expect(count("bottle_transfer")).toBe(0);
  });

  it("an empty bottle can be removed without a transfer", () => {
    const { d, r, count, repos } = setup();
    unwrap(removeBottle(d, r.bottle("Long-term Savings").id));
    expect(count("bottle_transfer")).toBe(0);
    expect(repos.bottles.get(r.bottle("Long-term Savings").id)?.archivedAt).not.toBeNull();
  });
});

describe("reports over real data (BR-7, BR-8)", () => {
  function seedMonth() {
    const t = setup("2026-11-12");
    const { d, r, repos } = t;
    repos.exchangeRates.upsert({ month: "2026-11", currency: "VND", rateToBase: 0.00004 });
    repos.livingLimits.upsert({ month: "2026-11", limitMinor: 5_000 });
    unwrap(addIncome(d, salary({ payDaySlot: "2026-11-10" })));
    const exp = (o: Record<string, unknown>) =>
      unwrap(
        addExpense(d, {
          currency: "USD",
          paymentMethodId: r.method("debit").id,
          categoryId: r.category("Groceries").id,
          ...o,
        } as never),
      );
    exp({ date: "2026-11-03", amountMinor: 2_000 });
    exp({
      date: "2026-11-04",
      amountMinor: 1_500,
      categoryId: r.category("Dining").id,
      paymentMethodId: r.method("credit").id,
    });
    exp({ date: "2026-11-05", amountMinor: 10_000, categoryId: r.category("Tuition").id });
    exp({ date: "2026-11-06", amountMinor: 50_000, currency: "VND", paymentMethodId: r.method("cash").id }); // $2.00
    // October VND expense recorded without any rate for October (legacy row).
    repos.expenses.insert({
      id: "legacy-vnd",
      date: "2026-10-20",
      amountMinor: 90_000,
      currency: "VND",
      fxRateToBase: null,
      categoryId: r.category("Groceries").id,
      paymentMethodId: r.method("cash").id,
      bottleId: null,
      note: null,
      source: "manual",
      subscriptionId: null,
      billingMonth: null,
      createdAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-20T00:00:00.000Z",
    });
    return t;
  }

  it("monthly report: totals, splits, living limit (Tuition excluded), VND converted", () => {
    const { d, r } = seedMonth();
    const rep = getMonthlyReport(d, "2026-11");
    expect(rep.totalSpendMinor).toBe(2_000 + 1_500 + 10_000 + 200);
    expect(rep.byPaymentType).toEqual({ credit: 1_500, debit: 12_000, cash: 200 });
    expect(rep.byKind.other).toBe(10_000);
    expect(rep.incomeTotalMinor).toBe(100_000);
    expect(rep.bottleAllocations.reduce((a, x) => a + x.totalMinor, 0)).toBe(100_000);
    expect(rep.livingLimit).toMatchObject({ limitMinor: 5_000, spentMinor: 3_700, status: "ok" });
    expect(rep.missingRateExpenseIds).toEqual([]);
    expect(rep.missingRateIncomeIds).toEqual([]);
    expect(rep.topExpenses[0]).toMatchObject({ categoryId: r.category("Tuition").id, amountMinor: 10_000 });
    expect(rep.deltaVsPreviousMinor).toBe(rep.totalSpendMinor); // October had no convertible spend
  });

  it("flags a VND expense with no rate instead of counting it as 1", () => {
    const { d } = seedMonth();
    const rep = getMonthlyReport(d, "2026-10");
    expect(rep.totalSpendMinor).toBe(0);
    expect(rep.missingRateExpenseIds).toEqual(["legacy-vnd"]);
  });

  it("comparison series: week, month and year, last 5, with incomplete flags", () => {
    const { d } = seedMonth();
    const week = getComparison(d, "week", 5);
    expect(week.points.map((p) => p.period.id)).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
    ]);
    expect(week.points[3]?.spendMinor).toBe(13_700); // Nov 3–6
    expect(week.points[4]?.spendMinor).toBe(0);
    expect(week.points[1]?.missingRateCount).toBe(1); // Oct 20 legacy VND

    const month = getComparison(d, "month", 5);
    expect(month.points.map((p) => p.period.id)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(month.points[4]).toMatchObject({
      spendMinor: 13_700,
      incomeMinor: 100_000,
      livingSpentMinor: 3_700,
    });
    expect(month.points[3]?.missingRateCount).toBe(1);

    const year = getComparison(d, "year", 5);
    expect(year.points.map((p) => p.period.id)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
    expect(year.points[4]).toMatchObject({ spendMinor: 13_700, incomeMinor: 100_000, missingRateCount: 1 });
  });

  it("archived category, payment method and bottle still appear in reports", () => {
    const { d, r, repos } = seedMonth();
    const now = "2026-11-11T00:00:00.000Z";
    repos.categories.archive(r.category("Dining").id, now);
    repos.paymentMethods.archive(r.method("credit").id, now);
    repos.bottles.archive(r.bottle("Play").id, now);
    const rep = getMonthlyReport(d, "2026-11");
    expect(rep.byCategory.some((c) => c.categoryId === r.category("Dining").id)).toBe(true);
    expect(rep.byPaymentType.credit).toBe(1_500);
    expect(() => getComparison(d, "month", 5)).not.toThrow();
    expect(rep.bottleBalances.some((b) => b.bottleId === r.bottle("Play").id)).toBe(true);
  });
});

describe("monthly snapshots (BR-7)", () => {
  function seedHistory() {
    const t = setup("2026-11-12");
    const { d, r } = t;
    const add = (date: string, amountMinor: number) =>
      unwrap(
        addExpense(d, {
          date,
          amountMinor,
          currency: "USD",
          categoryId: r.category("Groceries").id,
          paymentMethodId: r.method("debit").id,
        }),
      );
    add("2026-08-15", 1_000);
    add("2026-10-20", 3_000);
    add("2026-11-03", 500);
    return { ...t, add };
  }

  it("catches up every ended month once, never the current month", () => {
    const { d, repos } = seedHistory();
    expect(snapshotClosedMonths(d)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(snapshotClosedMonths(d)).toEqual([]);
    expect(repos.monthlyReports.months().sort()).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(repos.monthlyReports.get("2026-09")?.totalSpendMinor).toBe(0);
  });

  it("closed months read from the snapshot; the current month is live", () => {
    const { d, add } = seedHistory();
    snapshotClosedMonths(d);
    expect(getMonthlyReport(d, "2026-10").totalSpendMinor).toBe(3_000);
    add("2026-11-04", 700);
    expect(getMonthlyReport(d, "2026-11").totalSpendMinor).toBe(1_200);
  });

  it("snapshot balances are month-end, not current", () => {
    const { d, r } = seedHistory();
    unwrap(addIncome(d, salary({ date: "2026-10-10", amountMinor: 100_000 })));
    snapshotClosedMonths(d);
    unwrap(addIncome(d, salary({ date: "2026-11-10", amountMinor: 100_000 })));
    const nec = (rep: ReturnType<typeof getMonthlyReport>) =>
      rep.bottleBalances.find((b) => b.bottleId === r.bottle("Necessities").id)?.balanceMinor;
    // Oct 10 income 50_000 to Necessities, minus the Oct 20 expense (3_000), minus Aug (1_000); Nov income excluded.
    expect(nec(getMonthlyReport(d, "2026-10"))).toBe(50_000 - 3_000 - 1_000);
  });

  it("a late edit to a closed month invalidates its snapshot (lead decision #1)", () => {
    const { d, add } = seedHistory();
    snapshotClosedMonths(d);
    add("2026-10-25", 400);
    expect(getMonthlyReport(d, "2026-10").totalSpendMinor).toBe(3_400);
  });
});
