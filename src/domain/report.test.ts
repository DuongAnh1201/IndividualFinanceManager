import { describe, expect, it } from "vitest";
import {
  buildComparisonSeries,
  buildMonthlyReport,
  livingLimitForPeriod,
  monthsNeedingSnapshot,
  shouldSnapshot,
  type ReportData,
} from "./report";
import { periodOf } from "./period";
import type { Category, Expense, Income, PaymentMethod } from "./types";

const cat = (id: string, kind: Category["kind"], counts: boolean): Category => ({
  id,
  name: id,
  kind,
  countsTowardLivingLimit: counts,
  defaultBottleId: null,
  color: "#fff",
  mascot: "m",
  archivedAt: null,
});
const pm = (id: string, type: PaymentMethod["type"]): PaymentMethod => ({
  id,
  name: id,
  type,
  last4: null,
  archivedAt: null,
});

let n = 0;
const exp = (o: Partial<Expense>): Expense => ({
  id: `e${++n}`,
  date: "2026-11-05",
  amountMinor: 1000,
  currency: "USD",
  fxRateToBase: null,
  categoryId: "food",
  paymentMethodId: "visa",
  bottleId: null,
  note: null,
  source: "manual",
  subscriptionId: null,
  billingMonth: null,
  createdAt: "",
  updatedAt: "",
  ...o,
});
const inc = (o: Partial<Income>): Income => ({
  id: `i${++n}`,
  date: "2026-11-10",
  amountMinor: 100_000,
  currency: "USD",
  fxRateToBase: null,
  source: "Salary",
  note: null,
  payDaySlot: null,
  bottleRuleVersionId: "v1",
  ...o,
});

const base: ReportData = {
  baseCurrency: "USD",
  expenses: [],
  incomes: [],
  allocations: [],
  categories: [
    cat("food", "daily", true),
    cat("netflix", "subscription", false),
    cat("tuition", "other", false),
    cat("fun", "daily", true),
  ],
  paymentMethods: [pm("visa", "credit"), pm("debit", "debit"), pm("cash", "cash")],
  exchangeRates: [{ month: "2026-11", currency: "VND", rateToBase: 0.00004 }],
  livingLimits: [{ month: "2026-10", limitMinor: 3100 }],
  bottleBalances: [{ bottleId: "nec", balanceMinor: 42 }],
};

describe("buildMonthlyReport", () => {
  const i1 = inc({ id: "inc1" });
  const data: ReportData = {
    ...base,
    expenses: [
      exp({ id: "a", amountMinor: 2000 }),
      exp({ id: "b", amountMinor: 500, categoryId: "fun", paymentMethodId: "debit", date: "2026-11-30" }),
      exp({
        id: "c",
        amountMinor: 1500,
        categoryId: "netflix",
        paymentMethodId: "visa",
        source: "subscription",
      }),
      exp({ id: "d", amountMinor: 9000, categoryId: "tuition", paymentMethodId: "cash" }),
      exp({ id: "v", amountMinor: 50_000, currency: "VND", categoryId: "food", paymentMethodId: "cash" }), // $2.00
      exp({ id: "x", amountMinor: 777, date: "2026-12-01" }), // other month
      exp({ id: "p", amountMinor: 4000, date: "2026-10-31" }), // previous month
    ],
    incomes: [i1, inc({ amountMinor: 5000, date: "2026-10-25" })],
    allocations: [
      { id: "al1", incomeId: "inc1", bottleId: "nec", amountMinor: 50_000 },
      { id: "al2", incomeId: "inc1", bottleId: "play", amountMinor: 10_000 },
    ],
  };
  const r = buildMonthlyReport("2026-11", data);

  it("totals and base conversion", () => {
    expect(r.totalSpendMinor).toBe(2000 + 500 + 1500 + 9000 + 200);
    expect(r.baseCurrency).toBe("USD");
    expect(r.missingRateExpenseIds).toEqual([]);
  });
  it("by category sorted high→low", () => {
    expect(r.byCategory).toEqual([
      { categoryId: "tuition", totalMinor: 9000 },
      { categoryId: "food", totalMinor: 2200 },
      { categoryId: "netflix", totalMinor: 1500 },
      { categoryId: "fun", totalMinor: 500 },
    ]);
  });
  it("by kind sums to total", () => {
    expect(r.byKind).toEqual({ subscription: 1500, daily: 2700, other: 9000 });
    expect(Object.values(r.byKind).reduce((a, b) => a + b, 0)).toBe(r.totalSpendMinor);
  });
  it("by payment method and type", () => {
    expect(r.byPaymentType).toEqual({ credit: 3500, debit: 500, cash: 9200 });
    expect(r.byPaymentMethod.find((m) => m.paymentMethodId === "cash")).toEqual({
      paymentMethodId: "cash",
      type: "cash",
      totalMinor: 9200,
    });
  });
  it("income and bottle allocations for the month only", () => {
    expect(r.incomeTotalMinor).toBe(100_000);
    expect(r.bottleAllocations).toEqual([
      { bottleId: "nec", totalMinor: 50_000 },
      { bottleId: "play", totalMinor: 10_000 },
    ]);
    expect(r.bottleBalances).toEqual([{ bottleId: "nec", balanceMinor: 42 }]);
  });
  it("living limit excludes non-counting categories; carried forward", () => {
    // food 2200 + fun 500 = 2700 of carried limit 3100 → 87% warning
    expect(r.livingLimit).toMatchObject({ limitMinor: 3100, spentMinor: 2700, status: "warning" });
  });
  it("top expenses: at most 5, largest first", () => {
    expect(r.topExpenses.map((t) => t.expenseId)).toEqual(["d", "a", "c", "b", "v"]);
    expect(r.topExpenses[4]?.amountMinor).toBe(200);
  });
  it("delta vs previous month", () => {
    expect(r.deltaVsPreviousMinor).toBe(r.totalSpendMinor - 4000);
  });
  it("delta is null with no earlier history", () => {
    expect(
      buildMonthlyReport("2026-11", { ...data, expenses: data.expenses.filter((e) => e.id !== "p") })
        .deltaVsPreviousMinor,
    ).toBeNull();
  });
  it("no limit ever set → livingLimit null", () => {
    expect(buildMonthlyReport("2026-11", { ...data, livingLimits: [] }).livingLimit).toBeNull();
  });
  it("missing rate: excluded from totals and listed", () => {
    const rep = buildMonthlyReport("2026-12", {
      ...base,
      expenses: [
        exp({ id: "m", currency: "VND", amountMinor: 1_000_000, date: "2026-12-03" }),
        exp({ amountMinor: 300, date: "2026-12-04" }),
      ],
    });
    expect(rep.totalSpendMinor).toBe(300);
    expect(rep.missingRateExpenseIds).toEqual(["m"]);
  });
  it("missing-rate incomes: excluded from income total, listed", () => {
    const rep = buildMonthlyReport("2026-12", {
      ...base,
      incomes: [
        inc({ id: "ok", date: "2026-12-10", amountMinor: 5000 }),
        inc({ id: "vnd", date: "2026-12-10", currency: "VND", amountMinor: 9_000_000 }),
      ],
      allocations: [{ id: "al", incomeId: "vnd", bottleId: "nec", amountMinor: 9_000_000 }],
    });
    expect(rep.incomeTotalMinor).toBe(5000);
    expect(rep.missingRateIncomeIds).toEqual(["vnd"]);
    expect(rep.bottleAllocations).toEqual([{ bottleId: "nec", totalMinor: 0 }]);
  });
  it("empty month", () => {
    const rep = buildMonthlyReport("2027-01", base);
    expect(rep).toMatchObject({
      totalSpendMinor: 0,
      byCategory: [],
      topExpenses: [],
      deltaVsPreviousMinor: null,
    });
  });
  it("throws on dangling references", () => {
    expect(() =>
      buildMonthlyReport("2026-11", { ...base, expenses: [exp({ categoryId: "ghost" })] }),
    ).toThrow();
    expect(() =>
      buildMonthlyReport("2026-11", { ...base, expenses: [exp({ paymentMethodId: "ghost" })] }),
    ).toThrow();
  });
});

describe("livingLimitForPeriod", () => {
  const limits = [{ month: "2026-02", limitMinor: 2800 }];
  it("full month = its limit; prorated week; none = null", () => {
    expect(livingLimitForPeriod(periodOf("month", "2026-02-10"), limits)).toBe(2800);
    expect(livingLimitForPeriod(periodOf("week", "2026-02-10"), limits)).toBe(700); // 7/28
    expect(livingLimitForPeriod(periodOf("month", "2026-01-10"), limits)).toBeNull();
  });
  it("week straddling two months uses each month's day count", () => {
    const l = [
      { month: "2026-01", limitMinor: 3100 },
      { month: "2026-02", limitMinor: 2800 },
    ];
    // Mon 2026-01-26 … Sun 2026-02-01: 6 days Jan (600) + 1 day Feb (100)
    expect(livingLimitForPeriod(periodOf("week", "2026-01-26"), l)).toBe(6 * 100 + 100);
  });
  it("year sums 12 months (carry forward)", () => {
    expect(
      livingLimitForPeriod(periodOf("year", "2026-06-01"), [{ month: "2026-01", limitMinor: 1000 }]),
    ).toBe(12_000);
  });
});

describe("buildComparisonSeries", () => {
  const data: ReportData = {
    ...base,
    livingLimits: [{ month: "2026-01", limitMinor: 3100 }],
    expenses: [
      exp({ amountMinor: 100, date: "2026-11-02" }), // Mon of current week
      exp({ amountMinor: 200, date: "2026-11-01" }), // Sun → previous week
      exp({ amountMinor: 400, date: "2026-10-26", categoryId: "tuition" }),
      exp({ amountMinor: 50_000, currency: "VND", date: "2026-11-03" }), // $2.00
      exp({ amountMinor: 900, currency: "VND", date: "2026-09-03" }), // missing rate
    ],
    incomes: [inc({ date: "2026-11-03", amountMinor: 7000 })],
  };

  it("weeks: last 5, oldest first, boundaries on Monday", () => {
    const s = buildComparisonSeries("week", 5, "2026-11-04", 1, data);
    expect(s.points).toHaveLength(5);
    expect(s.points.map((p) => p.period.id)).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
    ]);
    const last = s.points[4]!;
    expect(last.spendMinor).toBe(300); // 100 + $2.00; Sunday's 200 belongs to the week before
    expect(last.incomeMinor).toBe(7000);
    expect(s.points[3]?.spendMinor).toBe(600); // 200 (Sun Nov 1) + 400 (Mon Oct 26)
    expect(last.livingSpentMinor).toBe(300);
    expect(s.points[3]?.livingSpentMinor).toBe(200); // tuition excluded
  });
  it("weeks with Sunday start move the boundary", () => {
    const s = buildComparisonSeries("week", 2, "2026-11-04", 0, data);
    expect(s.points.map((p) => p.period.id)).toEqual(["2026-10-25", "2026-11-01"]);
    expect(s.points[1]?.spendMinor).toBe(500); // Sun Nov 1 (200) + 100 + 200
  });
  it("months: last 5 across the year boundary with per-month limit and missing count", () => {
    const s = buildComparisonSeries("month", 5, "2027-01-15", 1, data);
    expect(s.points.map((p) => p.period.id)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(s.points[0]).toMatchObject({ spendMinor: 0, missingRateCount: 1, livingLimitMinor: 3100 });
    expect(s.points[2]).toMatchObject({ spendMinor: 500, incomeMinor: 7000 });
  });
  it("years: calendar years, limit summed", () => {
    const s = buildComparisonSeries("year", 5, "2026-11-04", 1, data);
    expect(s.points.map((p) => p.period.id)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
    expect(s.points[4]?.spendMinor).toBe(100 + 200 + 400 + 200);
    expect(s.points[4]?.livingLimitMinor).toBe(12 * 3100);
    expect(s.points[0]?.livingLimitMinor).toBeNull();
    expect(s.baseCurrency).toBe("USD");
  });
  it("missingRateIncomeCount per point", () => {
    const d = {
      ...data,
      incomes: [...data.incomes, inc({ currency: "VND", amountMinor: 1, date: "2026-12-05" })],
    };
    const s = buildComparisonSeries("month", 2, "2026-12-15", 1, d);
    expect(s.points.map((p) => p.missingRateIncomeCount)).toEqual([0, 1]);
    expect(s.points[1]?.incomeMinor).toBe(0);
  });
  it("by category per point", () => {
    const s = buildComparisonSeries("month", 1, "2026-10-15", 1, data);
    expect(s.points[0]?.byCategory).toEqual([{ categoryId: "tuition", totalMinor: 400 }]);
  });
});

describe("snapshots", () => {
  it("due only after the month ended and when missing", () => {
    expect(shouldSnapshot("2026-10", "2026-11-01", null)).toBe(true);
    expect(shouldSnapshot("2026-10", "2026-10-31", null)).toBe(false);
    expect(shouldSnapshot("2026-11", "2026-11-15", undefined)).toBe(false);
    expect(shouldSnapshot("2026-10", "2026-11-01", { month: "2026-10" } as never)).toBe(false);
  });
  it("catches up all missed months, oldest first", () => {
    expect(monthsNeedingSnapshot("2026-09", "2026-12-02", ["2026-10"])).toEqual(["2026-09", "2026-11"]);
    expect(monthsNeedingSnapshot("2026-12", "2026-12-02", [])).toEqual([]);
    expect(monthsNeedingSnapshot("2026-11", "2027-01-01", [])).toEqual(["2026-11", "2026-12"]);
  });
});
