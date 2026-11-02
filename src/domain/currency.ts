import { monthRate } from "./expense";
import { convertToBase } from "./money";
import { monthOf } from "./period";
import type { CurrencyCode, ExchangeRate, IsoDate } from "./types";

/** Anything with an amount, currency, date and optional own rate (expense, income, …). */
export interface ConvertibleAmount {
  amountMinor: number;
  currency: CurrencyCode;
  /** The transaction's own snapshot rate; null/undefined → fall back to the month's rate. */
  fxRateToBase?: number | null;
  /** Date of the transaction; its month selects the fallback `exchange_rate`. */
  date: IsoDate;
}

/**
 * BR-8: convert one transaction to base minor units. Rate = the transaction's own
 * `fxRateToBase`, else the month's `exchange_rate`; otherwise `null` (missing rate —
 * never silently 1). Converted per transaction, rounded half-even, then summed by callers.
 */
export function toBaseMinor(
  item: ConvertibleAmount,
  baseCurrency: CurrencyCode,
  rates: readonly ExchangeRate[],
): number | null {
  const rate = item.fxRateToBase ?? monthRate(rates, monthOf(item.date), item.currency);
  const r = convertToBase({ amountMinor: item.amountMinor, currency: item.currency }, baseCurrency, rate);
  return r.ok ? r.money.amountMinor : null;
}
