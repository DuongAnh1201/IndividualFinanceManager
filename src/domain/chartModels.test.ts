import { describe, expect, it } from "vitest";
import {
  incomeVsSpendRows,
  isIncomplete,
  livingLimitRows,
  OTHER_CATEGORY_ID,
  paymentSplit,
  periodLabel,
  stackedCategoryRows,
} from "./chartModels";
import { periodOf } from "./period";
import type { Category, ComparisonPoint, ComparisonSeries, MonthlyReport } from "./types";

const cat = (id: string, color: string): Category => ({
  id,
  name: id.toUpperCase(),
  kind: "daily",
  countsTowardLivingLimit: true,
  defaultBottleId: null,
  color,
  mascot: "m",
  archivedAt: null,
});

const point = (monthDate: string, o: Partial<ComparisonPoint> = {}): ComparisonPoint => ({
  period: periodOf("month", monthDate),
  byCategory: [],
  incomeMinor: 0,
  spendMinor: 0,
  livingLimitMinor: null,
  livingSpentMinor: 0,
  missingRateCount: 0,
  missingRateIncomeCount: 0,
  ...o,
});
const series = (points: ComparisonPoint[]): ComparisonSeries => ({
  granularity: "month",
  baseCurrency: "USD",
  points,
});

describe("periodLabel", () => {
  it("week uses an inclusive end, month and year formats", () => {
    expect(periodLabel(periodOf("week", "2026-11-01"))).toBe("Oct 26 – Nov 1");
    expect(periodLabel(periodOf("week", "2026-11-04"))).toBe("Nov 2 – Nov 8");
    expect(periodLabel(periodOf("week", "2027-01-01"))).toBe("Dec 28 – Jan 3");
    expect(periodLabel(periodOf("month", "2026-11-15"))).toBe("Nov 2026");
    expect(periodLabel(periodOf("year", "2026-06-01"))).toBe("2026");
  });
});

describe("stackedCategoryRows", () => {
  const cats = ["a", "b", "c", "d"].map((id, i) => cat(id, `#00000${i}`));
  const s = series([
    point("2026-09-01", {
      spendMinor: 700,
      byCategory: [
        { categoryId: "a", totalMinor: 500 },
        { categoryId: "d", totalMinor: 200 },
      ],
    }),
    point("2026-10-01", {
      spendMinor: 650,
      byCategory: [
        { categoryId: "b", totalMinor: 300 },
        { categoryId: "c", totalMinor: 250 },
        { categoryId: "a", totalMinor: 100 },
      ],
    }),
  ]);

  it("keeps everything when under topN; no Other series", () => {
    const r = stackedCategoryRows(s, cats, 6);
    expect(r.series.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(r.series[0]).toEqual({ id: "a", name: "A", color: "#000000" });
    expect(r.rows[0]?.values).toEqual({ a: 500, b: 0, c: 0, d: 200 });
    expect(OTHER_CATEGORY_ID in (r.rows[0]?.values ?? {})).toBe(false);
  });
  it("folds the rest into Other, rows sum to spend", () => {
    const r = stackedCategoryRows(s, cats, 2);
    expect(r.series.map((x) => x.id)).toEqual(["a", "b", OTHER_CATEGORY_ID]);
    expect(r.series[2]?.name).toBe("Other");
    expect(r.rows[0]?.values).toEqual({ a: 500, b: 0, [OTHER_CATEGORY_ID]: 200 });
    expect(r.rows[1]?.values).toEqual({ a: 100, b: 300, [OTHER_CATEGORY_ID]: 250 });
    for (const row of r.rows) {
      expect(Object.values(row.values).reduce((x, y) => x + y, 0)).toBe(row.totalMinor);
    }
  });
  it("unknown category ids go to Other; labels and flags", () => {
    const r = stackedCategoryRows(
      series([
        point("2026-11-01", {
          spendMinor: 90,
          byCategory: [{ categoryId: "ghost", totalMinor: 90 }],
          missingRateCount: 1,
        }),
      ]),
      cats,
    );
    expect(r.series.map((x) => x.id)).toEqual([OTHER_CATEGORY_ID]);
    expect(r.rows[0]).toMatchObject({ label: "Nov 2026", periodId: "2026-11", incomplete: true });
  });
  it("empty series and invalid topN", () => {
    expect(stackedCategoryRows(series([point("2026-11-01")]), cats)).toMatchObject({
      series: [],
      rows: [{ values: {} }],
    });
    expect(() => stackedCategoryRows(s, cats, 0)).toThrow();
  });
  it("tie-breaks equal totals by id", () => {
    const tie = series([
      point("2026-11-01", {
        spendMinor: 20,
        byCategory: [
          { categoryId: "b", totalMinor: 10 },
          { categoryId: "a", totalMinor: 10 },
        ],
      }),
    ]);
    expect(stackedCategoryRows(tie, cats, 1).series.map((x) => x.id)).toEqual(["a", OTHER_CATEGORY_ID]);
  });
});

describe("incomeVsSpendRows / incomplete flags", () => {
  it("net and incomplete from either missing counter", () => {
    const rows = incomeVsSpendRows(
      series([
        point("2026-10-01", { incomeMinor: 1000, spendMinor: 400 }),
        point("2026-11-01", { incomeMinor: 100, spendMinor: 400, missingRateIncomeCount: 1 }),
      ]),
    );
    expect(rows.map((r) => r.netMinor)).toEqual([600, -300]);
    expect(rows.map((r) => r.incomplete)).toEqual([false, true]);
    expect(isIncomplete(point("2026-11-01", { missingRateCount: 2 }))).toBe(true);
  });
});

describe("livingLimitRows", () => {
  it("null-safe when there is no limit; status otherwise", () => {
    const rows = livingLimitRows(
      series([
        point("2026-09-01", { livingSpentMinor: 500 }),
        point("2026-10-01", { livingLimitMinor: 1000, livingSpentMinor: 850 }),
        point("2026-11-01", { livingLimitMinor: 1000, livingSpentMinor: 1000 }),
        point("2026-12-01", { livingLimitMinor: 0, livingSpentMinor: 5 }),
      ]),
    );
    expect(rows[0]).toMatchObject({ limitMinor: null, ratio: null, status: null, spentMinor: 500 });
    expect(rows[1]).toMatchObject({ limitMinor: 1000, ratio: 0.85, status: "warning" });
    expect(rows[2]).toMatchObject({ status: "over" });
    expect(rows[3]).toMatchObject({ ratio: Infinity, status: "over" });
  });
});

describe("paymentSplit", () => {
  const report = (byPaymentType: MonthlyReport["byPaymentType"]) => ({ byPaymentType }) as MonthlyReport;
  it("fixed order, ratios, zero slices omitted", () => {
    const s = paymentSplit(report({ credit: 300, debit: 0, cash: 100 }));
    expect(s.map((x) => x.type)).toEqual(["credit", "cash"]);
    expect(s.map((x) => x.ratio)).toEqual([0.75, 0.25]);
    expect(s[0]).toMatchObject({ label: "Credit", totalMinor: 300 });
  });
  it("empty when nothing was spent", () => {
    expect(paymentSplit(report({ credit: 0, debit: 0, cash: 0 }))).toEqual([]);
  });
});
