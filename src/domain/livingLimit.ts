import { toBaseMinor } from "./currency";
import { monthOf } from "./period";
import type {
  BottleAllocation,
  Category,
  CurrencyCode,
  ExchangeRate,
  Expense,
  Id,
  Income,
  IsoMonth,
  LivingLimit,
  LivingLimitStatus,
} from "./types";

/** BR-6: ok < 80 % ≤ warning < 100 % ≤ over. */
export const WARNING_THRESHOLD = { numerator: 4, denominator: 5 } as const;

export interface LivingSpent {
  /** Base-currency minor units. */
  spentMinor: number;
  /** Counted expenses lacking an FX rate (BR-8): excluded from the total, never treated as 1. */
  missingRateExpenseIds: Id[];
}

/**
 * Living spend for `month`: base-converted expenses in categories with `countsTowardLivingLimit`
 * (Tuition etc. excluded). Conversion per transaction, half-even (BR-8): the expense's own
 * `fxRateToBase`, else the month's rate.
 */
export function livingSpent(
  expenses: readonly Expense[],
  categories: readonly Category[],
  month: IsoMonth,
  baseCurrency: CurrencyCode,
  rates: readonly ExchangeRate[],
): LivingSpent {
  const counting = new Set(categories.filter((c) => c.countsTowardLivingLimit).map((c) => c.id));
  let spentMinor = 0;
  const missingRateExpenseIds: Id[] = [];
  for (const e of expenses) {
    if (monthOf(e.date) !== month || !counting.has(e.categoryId)) continue;
    const base = toBaseMinor(e, baseCurrency, rates);
    if (base !== null) spentMinor += base;
    else missingRateExpenseIds.push(e.id);
  }
  return { spentMinor, missingRateExpenseIds };
}

/**
 * Status of spend vs limit. Exactly 80 % is `warning`, exactly 100 % is `over`.
 * limit 0: ratio 0 and `ok` if nothing spent, else Infinity and `over` (see types.ts).
 * Compared with integer math to avoid float edge cases.
 */
export function livingLimitStatus(
  month: IsoMonth,
  limitMinor: number,
  spentMinor: number,
): LivingLimitStatus {
  if (!Number.isSafeInteger(limitMinor) || limitMinor < 0) {
    throw new RangeError(`limitMinor must be a non-negative integer: ${limitMinor}`);
  }
  if (!Number.isSafeInteger(spentMinor)) throw new RangeError(`spentMinor must be an integer: ${spentMinor}`);
  const { numerator, denominator } = WARNING_THRESHOLD;
  const spent = Math.max(spentMinor, 0);
  let status: LivingLimitStatus["status"];
  if (spent >= limitMinor && spent > 0) status = "over";
  else if (spent * denominator >= limitMinor * numerator && spent > 0) status = "warning";
  else status = "ok";
  const ratio = limitMinor === 0 ? (spent === 0 ? 0 : Infinity) : spent / limitMinor;
  return { month, limitMinor, spentMinor, ratio, status };
}

export interface ResolvedLimit {
  limitMinor: number;
  /** `set` = this month's own limit; `carried` = from `fromMonth`. */
  source: "set" | "carried";
  fromMonth: IsoMonth;
}

/** This month's limit, else carried forward from the latest earlier month, else null. */
export function resolveLimit(month: IsoMonth, limits: readonly LivingLimit[]): ResolvedLimit | null {
  const own = limits.find((l) => l.month === month);
  if (own) return { limitMinor: own.limitMinor, source: "set", fromMonth: month };
  let prior: LivingLimit | null = null;
  for (const l of limits) {
    if (l.month < month && (!prior || l.month > prior.month)) prior = l;
  }
  return prior ? { limitMinor: prior.limitMinor, source: "carried", fromMonth: prior.month } : null;
}

/** Status for `month` using the resolved limit; null if no limit has ever been set. */
export function livingLimitStatusFor(
  month: IsoMonth,
  limits: readonly LivingLimit[],
  spentMinor: number,
): LivingLimitStatus | null {
  const limit = resolveLimit(month, limits);
  return limit ? livingLimitStatus(month, limit.limitMinor, spentMinor) : null;
}

export interface SuggestedLimit {
  /** Base-currency minor units. */
  limitMinor: number;
  /** Incomes whose allocation couldn't be converted (no rate); excluded, not counted as 1. */
  missingRateIncomeIds: Id[];
}

/**
 * Suggested limit = the month's allocations to the Necessities bottle, in base currency.
 * Allocations are in the income's currency; each is converted with the income's own rate,
 * else the month's rate (BR-8). The user may override.
 */
export function suggestedLimit(
  month: IsoMonth,
  necessitiesBottleId: Id,
  incomes: readonly Income[],
  allocations: readonly BottleAllocation[],
  baseCurrency: CurrencyCode,
  rates: readonly ExchangeRate[],
): SuggestedLimit {
  const incomeById = new Map(incomes.filter((i) => monthOf(i.date) === month).map((i) => [i.id, i]));
  let limitMinor = 0;
  const missing = new Set<Id>();
  for (const a of allocations) {
    const income = incomeById.get(a.incomeId);
    if (!income || a.bottleId !== necessitiesBottleId) continue;
    const base = toBaseMinor({ ...income, amountMinor: a.amountMinor }, baseCurrency, rates);
    if (base !== null) limitMinor += base;
    else missing.add(income.id);
  }
  return { limitMinor, missingRateIncomeIds: [...missing] };
}
