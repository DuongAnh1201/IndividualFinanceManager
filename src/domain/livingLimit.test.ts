import { describe, expect, it } from "vitest";
import {
  isValidWarningPercent,
  limitCrossing,
  livingLimitStatus,
  livingLimitStatusFor,
  livingSpent,
  remainingAllowance,
  resolveLimit,
  suggestedLimit,
} from "./livingLimit";
import type { BottleAllocation, Category, Expense, Income } from "./types";

const cat = (id: string, counts: boolean): Category => ({
  id,
  name: id,
  kind: "daily",
  countsTowardLivingLimit: counts,
  defaultBottleId: null,
  color: "#fff",
  mascot: "m",
  archivedAt: null,
});
const categories = [cat("food", true), cat("tuition", false)];

let n = 0;
const exp = (o: Partial<Expense>): Expense => ({
  id: `e${++n}`,
  date: "2026-11-05",
  amountMinor: 1000,
  currency: "USD",
  fxRateToBase: null,
  categoryId: "food",
  paymentMethodId: "p",
  bottleId: null,
  note: null,
  source: "manual",
  subscriptionId: null,
  billingMonth: null,
  createdAt: "",
  updatedAt: "",
  ...o,
});

const rates = [{ month: "2026-11", currency: "VND" as const, rateToBase: 0.00004 }];

describe("livingSpent", () => {
  it("counts only living-limit categories in the month", () => {
    const r = livingSpent(
      [
        exp({ amountMinor: 1000 }),
        exp({ amountMinor: 500_000, categoryId: "tuition" }),
        exp({ amountMinor: 700, date: "2026-10-31" }),
        exp({ amountMinor: 300, date: "2026-12-01" }),
        exp({ amountMinor: 200, categoryId: "unknown" }),
      ],
      categories,
      "2026-11",
      "USD",
      rates,
    );
    expect(r).toEqual({ spentMinor: 1000, missingRateExpenseIds: [] });
  });

  it("converts foreign currency: own rate first, then month rate, per transaction", () => {
    const r = livingSpent(
      [
        exp({ currency: "VND", amountMinor: 50_000 }), // month rate → $2.00
        exp({ currency: "VND", amountMinor: 50_000, fxRateToBase: 0.00005 }), // → $2.50
      ],
      categories,
      "2026-11",
      "USD",
      rates,
    );
    expect(r.spentMinor).toBe(450);
  });

  it("reports missing-rate expenses instead of counting them as 1", () => {
    const missing = exp({ currency: "VND", amountMinor: 99_999, date: "2026-12-02" });
    const r = livingSpent(
      [missing, exp({ date: "2026-12-03", amountMinor: 100 })],
      categories,
      "2026-12",
      "USD",
      rates,
    );
    expect(r).toEqual({ spentMinor: 100, missingRateExpenseIds: [missing.id] });
  });
});

describe("livingLimitStatus thresholds", () => {
  const s = (limit: number, spent: number) => livingLimitStatus("2026-11", limit, spent).status;
  it("ok below 80%", () => {
    expect(s(1000, 0)).toBe("ok");
    expect(s(1000, 799)).toBe("ok");
  });
  it("warning from exactly 80% up to 99.9%", () => {
    expect(s(1000, 800)).toBe("warning");
    expect(s(1000, 999)).toBe("warning");
  });
  it("over from exactly 100%", () => {
    expect(s(1000, 1000)).toBe("over");
    expect(s(1000, 5000)).toBe("over");
  });
  it("exact integer boundary for awkward limits", () => {
    expect(s(7, 5)).toBe("ok"); // 71.4%
    expect(s(5, 4)).toBe("warning"); // exactly 80%
    expect(s(3, 2)).toBe("ok"); // 66.7%
    expect(s(6, 5)).toBe("warning"); // 83.3%
  });
  it("returns ratio and inputs", () => {
    expect(livingLimitStatus("2026-11", 1000, 850)).toEqual({
      month: "2026-11",
      limitMinor: 1000,
      spentMinor: 850,
      ratio: 0.85,
      status: "warning",
    });
  });
  it("limit 0: ok when nothing spent, over (ratio Infinity) otherwise", () => {
    expect(livingLimitStatus("2026-11", 0, 0)).toMatchObject({ ratio: 0, status: "ok" });
    expect(livingLimitStatus("2026-11", 0, 1)).toMatchObject({ ratio: Infinity, status: "over" });
  });
  it("rejects invalid limits", () => {
    expect(() => livingLimitStatus("2026-11", -1, 0)).toThrow();
    expect(() => livingLimitStatus("2026-11", 1.5, 0)).toThrow();
  });
});

describe("resolveLimit / carry forward", () => {
  const limits = [
    { month: "2026-08", limitMinor: 100_000 },
    { month: "2026-10", limitMinor: 120_000 },
  ];
  it("uses the month's own limit", () => {
    expect(resolveLimit("2026-10", limits)).toEqual({
      limitMinor: 120_000,
      source: "set",
      fromMonth: "2026-10",
    });
  });
  it("carries forward the latest earlier limit", () => {
    expect(resolveLimit("2026-12", limits)).toEqual({
      limitMinor: 120_000,
      source: "carried",
      fromMonth: "2026-10",
    });
    expect(resolveLimit("2026-09", limits)).toMatchObject({ limitMinor: 100_000, fromMonth: "2026-08" });
  });
  it("never carries backwards; null when none", () => {
    expect(resolveLimit("2026-07", limits)).toBeNull();
    expect(resolveLimit("2026-07", [])).toBeNull();
  });
  it("livingLimitStatusFor", () => {
    expect(livingLimitStatusFor("2026-12", limits, 110_000)).toMatchObject({
      limitMinor: 120_000,
      status: "warning",
    });
    expect(livingLimitStatusFor("2026-01", limits, 5)).toBeNull();
  });
});

describe("suggestedLimit", () => {
  const income = (id: string, o: Partial<Income> = {}): Income => ({
    id,
    date: "2026-11-10",
    amountMinor: 0,
    currency: "USD",
    fxRateToBase: null,
    source: "Salary",
    note: null,
    payDaySlot: null,
    bottleRuleVersionId: "v1",
    ...o,
  });
  const alloc = (incomeId: string, bottleId: string, amountMinor: number): BottleAllocation => ({
    id: `${incomeId}-${bottleId}`,
    incomeId,
    bottleId,
    amountMinor,
  });

  it("sums the month's Necessities allocations only", () => {
    const r = suggestedLimit(
      "2026-11",
      "nec",
      [income("a"), income("b", { date: "2026-11-25" }), income("old", { date: "2026-10-25" })],
      [
        alloc("a", "nec", 250_000),
        alloc("a", "play", 50_000),
        alloc("b", "nec", 250_000),
        alloc("old", "nec", 999),
      ],
      "USD",
      [],
    );
    expect(r).toEqual({ limitMinor: 500_000, missingRateIncomeIds: [] });
  });
  it("converts VND allocations to base; reports missing rates", () => {
    const vnd = income("v", { currency: "VND" });
    const ok = suggestedLimit("2026-11", "nec", [vnd], [alloc("v", "nec", 25_000_000)], "USD", rates);
    expect(ok.limitMinor).toBe(100_000); // 25,000,000 ₫ × 0.00004 = $1,000.00
    const missing = suggestedLimit(
      "2026-12",
      "nec",
      [income("m", { currency: "VND", date: "2026-12-10" })],
      [alloc("m", "nec", 5)],
      "USD",
      rates,
    );
    expect(missing).toEqual({ limitMinor: 0, missingRateIncomeIds: ["m"] });
  });
  it("zero when no income", () => {
    expect(suggestedLimit("2026-11", "nec", [], [], "USD", [])).toEqual({
      limitMinor: 0,
      missingRateIncomeIds: [],
    });
  });
});

describe("configurable warning level", () => {
  it("validates 50–99 integers only", () => {
    for (const v of [50, 80, 99]) expect(isValidWarningPercent(v)).toBe(true);
    for (const v of [49, 100, 80.5, NaN, "80", null]) expect(isValidWarningPercent(v)).toBe(false);
  });

  it("uses W for the ok/warning boundary with integer math", () => {
    expect(livingLimitStatus("2026-11", 1000, 899, 90).status).toBe("ok");
    expect(livingLimitStatus("2026-11", 1000, 900, 90).status).toBe("warning");
    expect(livingLimitStatus("2026-11", 1000, 999, 90).status).toBe("warning");
    expect(livingLimitStatus("2026-11", 1000, 1000, 90).status).toBe("over");
    expect(livingLimitStatus("2026-11", 1000, 500, 50).status).toBe("warning");
    expect(livingLimitStatus("2026-11", 1000, 800).status).toBe("warning");
    expect(() => livingLimitStatus("2026-11", 1000, 800, 100)).toThrow(RangeError);
  });
});

describe("limitCrossing", () => {
  const st = (status: "ok" | "warning" | "over", month = "2026-11") => ({
    month,
    limitMinor: 1000,
    spentMinor: 0,
    ratio: 0,
    status,
  });
  it("alerts only when moving up into warning or over", () => {
    expect(limitCrossing(st("ok"), st("warning"))).toBe("warning");
    expect(limitCrossing(st("ok"), st("over"))).toBe("over");
    expect(limitCrossing(st("warning"), st("over"))).toBe("over");
  });
  it("is null when level, going down, no limit or across months", () => {
    expect(limitCrossing(st("ok"), st("ok"))).toBeNull();
    expect(limitCrossing(st("warning"), st("warning"))).toBeNull();
    expect(limitCrossing(st("over"), st("over"))).toBeNull();
    expect(limitCrossing(st("over"), st("warning"))).toBeNull();
    expect(limitCrossing(st("warning"), st("ok"))).toBeNull();
    expect(limitCrossing(null, st("over"))).toBeNull();
    expect(limitCrossing(st("ok"), null)).toBeNull();
    expect(limitCrossing(st("ok", "2026-10"), st("over"))).toBeNull();
  });
});

describe("remainingAllowance", () => {
  const status = (limitMinor: number, spentMinor: number) => ({
    month: "2026-11",
    limitMinor,
    spentMinor,
    ratio: 0,
    status: "ok" as const,
  });
  it("current month: days left include today, per day floors", () => {
    // Nov 12 → 19 days left (12..30).
    expect(remainingAllowance(status(10_000, 0), "2026-11-12")).toEqual({
      leftMinor: 10_000,
      daysLeft: 19,
      perDayMinor: 526,
    });
    expect(remainingAllowance(status(10_000, 0), "2026-11-30").daysLeft).toBe(1);
  });
  it("over or exactly spent: negative/zero left, per day 0", () => {
    expect(remainingAllowance(status(1000, 1500), "2026-11-12")).toEqual({
      leftMinor: -500,
      daysLeft: 19,
      perDayMinor: 0,
    });
    expect(remainingAllowance(status(1000, 1000), "2026-11-12").perDayMinor).toBe(0);
  });
  it("past or future month: daysLeft and perDay are null", () => {
    expect(remainingAllowance(status(1000, 400), "2026-12-01")).toEqual({
      leftMinor: 600,
      daysLeft: null,
      perDayMinor: null,
    });
    expect(remainingAllowance(status(1000, 400), "2026-10-31").daysLeft).toBeNull();
  });
  it("handles February in leap years", () => {
    const feb = { ...status(2900, 0), month: "2028-02" };
    expect(remainingAllowance(feb, "2028-02-01")).toMatchObject({ daysLeft: 29, perDayMinor: 100 });
  });
});
