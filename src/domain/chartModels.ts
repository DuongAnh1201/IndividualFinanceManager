import { addDays, parseDate } from "./period";
import { livingLimitStatus } from "./livingLimit";
import type {
  Category,
  ComparisonPoint,
  ComparisonSeries,
  Id,
  LivingLimitStatusKind,
  MonthlyReport,
  PaymentMethodType,
  Period,
} from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function monthDay(date: string): string {
  const { month, day } = parseDate(date);
  return `${MONTHS[month - 1]} ${day}`;
}

/** week "Oct 26 – Nov 1" (inclusive end), month "Nov 2026", year "2026". */
export function periodLabel(period: Period): string {
  switch (period.granularity) {
    case "week":
      return `${monthDay(period.start)} – ${monthDay(addDays(period.end, -1))}`;
    case "month": {
      const { year, month } = parseDate(period.start);
      return `${MONTHS[month - 1]} ${year}`;
    }
    case "year":
      return String(parseDate(period.start).year);
  }
}

/** True when a point's totals omit transactions lacking an FX rate (show a "incomplete" hint). */
export function isIncomplete(point: ComparisonPoint): boolean {
  return point.missingRateCount > 0 || point.missingRateIncomeCount > 0;
}

interface RowBase {
  periodId: string;
  label: string;
  /** Totals omit some transactions with no exchange rate. */
  incomplete: boolean;
}

const rowBase = (p: ComparisonPoint): RowBase => ({
  periodId: p.period.id,
  label: periodLabel(p.period),
  incomplete: isIncomplete(p),
});

// ---------- stacked categories ----------

export const OTHER_CATEGORY_ID = "__other__";
/** Neutral swatch for the "Other" bucket. */
export const OTHER_CATEGORY_COLOR = "#B8B5C4";
/** Chart series palette from docs/theme.md (muted pastels). */
export const CHART_PALETTE = [
  "#7C8C78",
  "#A3907A",
  "#8A9BAE",
  "#B59AA6",
  "#C2AE7E",
  "#8FA89C",
  "#A88C8C",
] as const;

export interface StackSeries {
  id: Id;
  name: string;
  color: string;
}

export interface StackedRow extends RowBase {
  /** Base-currency minor units per series id; every series id is present (0 when none). */
  values: Record<Id, number>;
  totalMinor: number;
}

export interface StackedCategoryChart {
  /** Legend order: biggest first, "Other" last (only when it has data). */
  series: StackSeries[];
  rows: StackedRow[];
}

/**
 * Stacked-bar data: the `topN` categories by total spend across the series, everything else
 * (and any unknown category id) folded into an "Other" bucket.
 */
export function stackedCategoryRows(
  series: ComparisonSeries,
  categories: readonly Category[],
  topN = 6,
): StackedCategoryChart {
  if (!Number.isInteger(topN) || topN < 1) throw new RangeError(`topN must be a positive integer: ${topN}`);
  const known = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<Id, number>();
  for (const p of series.points) {
    for (const t of p.byCategory) {
      if (known.has(t.categoryId)) totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.totalMinor);
    }
  }
  const top = [...totals]
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([id]) => id);
  const topSet = new Set(top);

  const rows: StackedRow[] = series.points.map((p) => {
    const values: Record<Id, number> = Object.fromEntries(top.map((id) => [id, 0]));
    let other = 0;
    for (const t of p.byCategory) {
      if (topSet.has(t.categoryId)) values[t.categoryId] = (values[t.categoryId] ?? 0) + t.totalMinor;
      else other += t.totalMinor;
    }
    values[OTHER_CATEGORY_ID] = other;
    return { ...rowBase(p), values, totalMinor: p.spendMinor };
  });

  const hasOther = rows.some((r) => (r.values[OTHER_CATEGORY_ID] ?? 0) > 0);
  if (!hasOther) for (const r of rows) delete r.values[OTHER_CATEGORY_ID];

  // 11 default categories share a 7-colour palette, so two visible series can collide
  // (e.g. Groceries/Daily and Tuition & Education). Keep each category's own colour when it
  // is unique among the visible series; otherwise take the next unused palette colour.
  const used = new Set<string>();
  const chartSeries: StackSeries[] = top.map((id) => {
    const c = known.get(id)!;
    const own = c.color.toUpperCase();
    const color = !used.has(own) ? own : (CHART_PALETTE.find((p) => !used.has(p)) ?? own);
    used.add(color);
    return { id, name: c.name, color };
  });
  if (hasOther) chartSeries.push({ id: OTHER_CATEGORY_ID, name: "Other", color: OTHER_CATEGORY_COLOR });
  return { series: chartSeries, rows };
}

// ---------- income vs spend ----------

export interface IncomeVsSpendRow extends RowBase {
  incomeMinor: number;
  spendMinor: number;
  /** income − spend (negative = overspent). */
  netMinor: number;
}

export function incomeVsSpendRows(series: ComparisonSeries): IncomeVsSpendRow[] {
  return series.points.map((p) => ({
    ...rowBase(p),
    incomeMinor: p.incomeMinor,
    spendMinor: p.spendMinor,
    netMinor: p.incomeMinor - p.spendMinor,
  }));
}

// ---------- living limit ----------

export interface LivingLimitRow extends RowBase {
  /** The limit line; null when no limit applies to the period (draw no line). */
  limitMinor: number | null;
  spentMinor: number;
  /** spent / limit; null without a limit (Infinity if the limit is 0 and something was spent). */
  ratio: number | null;
  status: LivingLimitStatusKind | null;
}

export function livingLimitRows(series: ComparisonSeries): LivingLimitRow[] {
  return series.points.map((p) => {
    const status =
      p.livingLimitMinor === null
        ? null
        : livingLimitStatus(p.period.id, p.livingLimitMinor, p.livingSpentMinor);
    return {
      ...rowBase(p),
      limitMinor: p.livingLimitMinor,
      spentMinor: p.livingSpentMinor,
      ratio: status?.ratio ?? null,
      status: status?.status ?? null,
    };
  });
}

// ---------- payment split donut ----------

export interface PaymentSlice {
  type: PaymentMethodType;
  label: string;
  totalMinor: number;
  /** Share of total spend, 0–1. */
  ratio: number;
}

const PAYMENT_LABELS: Record<PaymentMethodType, string> = { credit: "Credit", debit: "Debit", cash: "Cash" };
const PAYMENT_ORDER: PaymentMethodType[] = ["credit", "debit", "cash"];

/** Donut slices in fixed order credit → debit → cash; zero slices omitted (empty array if no spend). */
export function paymentSplit(report: MonthlyReport): PaymentSlice[] {
  const total = PAYMENT_ORDER.reduce((sum, t) => sum + report.byPaymentType[t], 0);
  if (total === 0) return [];
  return PAYMENT_ORDER.filter((t) => report.byPaymentType[t] > 0).map((type) => ({
    type,
    label: PAYMENT_LABELS[type],
    totalMinor: report.byPaymentType[type],
    ratio: report.byPaymentType[type] / total,
  }));
}
