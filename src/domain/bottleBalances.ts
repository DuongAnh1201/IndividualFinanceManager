import { monthRate } from "./expense";
import { convertToBase } from "./money";
import { monthOf } from "./period";
import type {
  Bottle,
  BottleAllocation,
  BottleBalance,
  BottleTransfer,
  CurrencyCode,
  ExchangeRate,
  Expense,
  Id,
  Income,
} from "./types";

export interface BottleBalancesResult {
  /** One entry per given bottle, in input order (base-currency minor units). */
  balances: BottleBalance[];
  /** Rows that could not be converted (no rate, BR-8): excluded, never treated as rate 1. */
  missingRate: { incomeIds: Id[]; transferIds: Id[]; expenseIds: Id[] };
}

/**
 * Derived bottle balance (data-model "Derived values"):
 * Σ allocations + Σ transfers in − Σ transfers out − Σ expenses with that bottle,
 * each converted to base per transaction (round half-even, then summed; BR-8).
 *
 * Rate per row: an allocation uses its income's `fxRateToBase`, else the month rate of
 * the income date; an expense uses its own rate, else its month's; a transfer has no
 * rate of its own, so the month rate of its date. Rows for unknown bottles, and expenses
 * without a bottle, are ignored.
 */
export function bottleBalances(
  bottles: readonly Pick<Bottle, "id">[],
  allocations: readonly BottleAllocation[],
  incomes: readonly Pick<Income, "id" | "date" | "currency" | "fxRateToBase">[],
  transfers: readonly BottleTransfer[],
  expenses: readonly Expense[],
  baseCurrency: CurrencyCode,
  rates: readonly ExchangeRate[],
): BottleBalancesResult {
  const totals = new Map<Id, number>(bottles.map((b) => [b.id, 0]));
  const add = (bottleId: Id | null, delta: number) => {
    if (bottleId === null) return;
    const cur = totals.get(bottleId);
    if (cur !== undefined) totals.set(bottleId, cur + delta);
  };
  const incomeById = new Map(incomes.map((i) => [i.id, i]));
  const missingIncomes = new Set<Id>();
  const missingTransfers: Id[] = [];
  const missingExpenses: Id[] = [];

  for (const a of allocations) {
    const income = incomeById.get(a.incomeId);
    if (!income) continue;
    const rate = income.fxRateToBase ?? monthRate(rates, monthOf(income.date), income.currency);
    const r = convertToBase({ amountMinor: a.amountMinor, currency: income.currency }, baseCurrency, rate);
    if (r.ok) add(a.bottleId, r.money.amountMinor);
    else missingIncomes.add(income.id);
  }

  for (const t of transfers) {
    const rate = monthRate(rates, monthOf(t.date), t.currency);
    const r = convertToBase({ amountMinor: t.amountMinor, currency: t.currency }, baseCurrency, rate);
    if (r.ok) {
      add(t.fromBottleId, -r.money.amountMinor);
      add(t.toBottleId, r.money.amountMinor);
    } else missingTransfers.push(t.id);
  }

  for (const e of expenses) {
    if (e.bottleId === null) continue;
    const rate = e.fxRateToBase ?? monthRate(rates, monthOf(e.date), e.currency);
    const r = convertToBase({ amountMinor: e.amountMinor, currency: e.currency }, baseCurrency, rate);
    if (r.ok) add(e.bottleId, -r.money.amountMinor);
    else missingExpenses.push(e.id);
  }

  return {
    balances: bottles.map((b) => ({ bottleId: b.id, balanceMinor: totals.get(b.id) ?? 0 })),
    missingRate: {
      incomeIds: [...missingIncomes],
      transferIds: missingTransfers,
      expenseIds: missingExpenses,
    },
  };
}
