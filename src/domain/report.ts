import { toBaseMinor } from "./currency";
import { livingLimitStatusFor, resolveLimit } from "./livingLimit";
import { addDays, daysInMonth, lastNPeriods, monthOf, parseDate, periodOf, previousPeriod } from "./period";
import type {
  BottleAllocation,
  BottleBalance,
  BottleTotal,
  Category,
  CategoryKind,
  CategoryTotal,
  ComparisonPoint,
  ComparisonSeries,
  CurrencyCode,
  ExchangeRate,
  Expense,
  Granularity,
  Id,
  Income,
  IsoDate,
  IsoMonth,
  LivingLimit,
  MonthlyReport,
  PaymentMethod,
  PaymentMethodTotal,
  PaymentMethodType,
  Period,
  TopExpense,
  WeekStart,
} from "./types";

/** Everything the report builders need; loaded by the caller (db layer). All history, not just the month. */
export interface ReportData {
  baseCurrency: CurrencyCode;
  expenses: readonly Expense[];
  incomes: readonly Income[];
  allocations: readonly BottleAllocation[];
  categories: readonly Category[];
  paymentMethods: readonly PaymentMethod[];
  exchangeRates: readonly ExchangeRate[];
  livingLimits: readonly LivingLimit[];
  /** Bottle balances as of now/month end (derived by the bottle-balance rule); passed through to the report. */
  bottleBalances: readonly BottleBalance[];
}

interface Converted {
  expense: Expense;
  baseMinor: number;
  category: Category;
}

/** Convert expenses to base (BR-8); those without a rate are returned separately and excluded. */
function convertExpenses(
  expenses: readonly Expense[],
  data: ReportData,
): { converted: Converted[]; missing: Id[] } {
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const converted: Converted[] = [];
  const missing: Id[] = [];
  for (const expense of expenses) {
    const category = categories.get(expense.categoryId);
    if (!category) throw new RangeError(`Unknown category ${expense.categoryId} on expense ${expense.id}`);
    const baseMinor = toBaseMinor(expense, data.baseCurrency, data.exchangeRates);
    if (baseMinor === null) missing.push(expense.id);
    else converted.push({ expense, baseMinor, category });
  }
  return { converted, missing };
}

const inRange = (date: IsoDate, start: IsoDate, end: IsoDate) => date >= start && date < end;

function sumBy<K>(items: readonly Converted[], key: (c: Converted) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const c of items) m.set(key(c), (m.get(key(c)) ?? 0) + c.baseMinor);
  return m;
}

/** Totals sorted high → low, ties by id, so output is deterministic. */
function categoryTotals(items: readonly Converted[]): CategoryTotal[] {
  return [...sumBy(items, (c) => c.category.id)]
    .map(([categoryId, totalMinor]) => ({ categoryId, totalMinor }))
    .sort((a, b) => b.totalMinor - a.totalMinor || a.categoryId.localeCompare(b.categoryId));
}

function incomeBase(incomes: readonly Income[], data: ReportData): number {
  let total = 0;
  for (const i of incomes) total += toBaseMinor(i, data.baseCurrency, data.exchangeRates) ?? 0;
  return total;
}

function spendTotal(items: readonly Converted[]): number {
  return items.reduce((sum, c) => sum + c.baseMinor, 0);
}

/** BR-7 monthly report. Expenses/incomes without an FX rate are excluded and listed (never counted as 1). */
export function buildMonthlyReport(month: IsoMonth, data: ReportData): MonthlyReport {
  const period = periodOf("month", `${month}-01`);
  const { converted, missing } = convertExpenses(
    data.expenses.filter((e) => inRange(e.date, period.start, period.end)),
    data,
  );

  const methods = new Map(data.paymentMethods.map((p) => [p.id, p]));
  const byMethod = sumBy(converted, (c) => c.expense.paymentMethodId);
  const byPaymentMethod: PaymentMethodTotal[] = [...byMethod]
    .map(([paymentMethodId, totalMinor]) => {
      const method = methods.get(paymentMethodId);
      if (!method) throw new RangeError(`Unknown payment method ${paymentMethodId}`);
      return { paymentMethodId, type: method.type, totalMinor };
    })
    .sort((a, b) => b.totalMinor - a.totalMinor || a.paymentMethodId.localeCompare(b.paymentMethodId));

  const byPaymentType: Record<PaymentMethodType, number> = { credit: 0, debit: 0, cash: 0 };
  for (const m of byPaymentMethod) byPaymentType[m.type] += m.totalMinor;

  const byKind: Record<CategoryKind, number> = { subscription: 0, daily: 0, other: 0 };
  for (const c of converted) byKind[c.category.kind] += c.baseMinor;

  const monthIncomes = data.incomes.filter((i) => inRange(i.date, period.start, period.end));
  const incomeById = new Map(monthIncomes.map((i) => [i.id, i]));
  const alloc = new Map<Id, number>();
  for (const a of data.allocations) {
    const income = incomeById.get(a.incomeId);
    if (!income) continue;
    const base = toBaseMinor(
      { ...income, amountMinor: a.amountMinor },
      data.baseCurrency,
      data.exchangeRates,
    );
    alloc.set(a.bottleId, (alloc.get(a.bottleId) ?? 0) + (base ?? 0));
  }
  const bottleAllocations: BottleTotal[] = [...alloc]
    .map(([bottleId, totalMinor]) => ({ bottleId, totalMinor }))
    .sort((a, b) => a.bottleId.localeCompare(b.bottleId));

  const living = converted.filter((c) => c.category.countsTowardLivingLimit);

  const topExpenses: TopExpense[] = [...converted]
    .sort(
      (a, b) =>
        b.baseMinor - a.baseMinor ||
        a.expense.date.localeCompare(b.expense.date) ||
        a.expense.id.localeCompare(b.expense.id),
    )
    .slice(0, 5)
    .map((c) => ({
      expenseId: c.expense.id,
      date: c.expense.date,
      categoryId: c.expense.categoryId,
      amountMinor: c.baseMinor,
      note: c.expense.note,
    }));

  // Delta vs the previous month; null when there is no earlier expense history at all.
  const prev = previousPeriod(period);
  const hasHistory = data.expenses.some((e) => e.date < period.start);
  let deltaVsPreviousMinor: number | null = null;
  if (hasHistory) {
    const prevItems = convertExpenses(
      data.expenses.filter((e) => inRange(e.date, prev.start, prev.end)),
      data,
    ).converted;
    deltaVsPreviousMinor = spendTotal(converted) - spendTotal(prevItems);
  }

  return {
    month,
    baseCurrency: data.baseCurrency,
    totalSpendMinor: spendTotal(converted),
    byCategory: categoryTotals(converted),
    byPaymentMethod,
    byPaymentType,
    byKind,
    incomeTotalMinor: incomeBase(monthIncomes, data),
    bottleAllocations,
    bottleBalances: [...data.bottleBalances],
    livingLimit: livingLimitStatusFor(month, data.livingLimits, spendTotal(living)),
    topExpenses,
    deltaVsPreviousMinor,
    missingRateExpenseIds: missing,
  };
}

/**
 * Living limit for an arbitrary period: each overlapping month's resolved limit (own or carried
 * forward, BR-6) prorated by the days of that month inside the period, rounded half-up per month.
 * A full month gives exactly its limit; a year sums its months; a week is prorated by day.
 * Months with no resolvable limit contribute nothing; null if none do. Future months are included.
 */
export function livingLimitForPeriod(period: Period, limits: readonly LivingLimit[]): number | null {
  let total = 0;
  let any = false;
  let cursor = period.start;
  while (cursor < period.end) {
    const { year, month } = parseDate(cursor);
    const dim = daysInMonth(year, month);
    const monthEnd = addDays(`${monthOf(cursor)}-01`, dim);
    const segmentEnd = monthEnd < period.end ? monthEnd : period.end;
    let days = 0;
    for (let d = cursor; d < segmentEnd; d = addDays(d, 1)) days++;
    const limit = resolveLimit(monthOf(cursor), limits);
    if (limit) {
      any = true;
      total += Math.round((limit.limitMinor * days) / dim);
    }
    cursor = segmentEnd;
  }
  return any ? total : null;
}

/** BR-7 comparison series over the last `n` (default 5) week/month/year periods ending at `today`. */
export function buildComparisonSeries(
  granularity: Granularity,
  n: number,
  today: IsoDate,
  weekStartsOn: WeekStart,
  data: ReportData,
): ComparisonSeries {
  const points: ComparisonPoint[] = lastNPeriods(granularity, n, today, weekStartsOn).map((period) => {
    const { converted, missing } = convertExpenses(
      data.expenses.filter((e) => inRange(e.date, period.start, period.end)),
      data,
    );
    const incomes = data.incomes.filter((i) => inRange(i.date, period.start, period.end));
    return {
      period,
      byCategory: categoryTotals(converted),
      incomeMinor: incomeBase(incomes, data),
      spendMinor: spendTotal(converted),
      livingLimitMinor: livingLimitForPeriod(period, data.livingLimits),
      livingSpentMinor: spendTotal(converted.filter((c) => c.category.countsTowardLivingLimit)),
      missingRateCount: missing.length,
    };
  });
  return { granularity, baseCurrency: data.baseCurrency, points };
}

/** A month's snapshot is due once the month has ended (first app open after) and none exists yet. */
export function shouldSnapshot(
  month: IsoMonth,
  today: IsoDate,
  existing: MonthlyReport | null | undefined,
): boolean {
  return monthOf(today) > month && !existing;
}

/** All ended months from `firstMonth` that still lack a snapshot, oldest first (catch-up after absence). */
export function monthsNeedingSnapshot(
  firstMonth: IsoMonth,
  today: IsoDate,
  existingMonths: readonly IsoMonth[],
): IsoMonth[] {
  const have = new Set(existingMonths);
  const result: IsoMonth[] = [];
  let period = periodOf("month", `${firstMonth}-01`);
  while (period.id < monthOf(today)) {
    if (!have.has(period.id)) result.push(period.id);
    period = periodOf("month", period.end);
  }
  return result;
}
