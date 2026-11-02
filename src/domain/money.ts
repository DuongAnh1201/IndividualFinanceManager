import type { CurrencyCode, Money } from "./types";

/** Minor-unit exponent per currency (ISO 4217, D-013). Extend when adding currencies. */
export const CURRENCY_EXPONENT: Record<CurrencyCode, number> = { USD: 2, VND: 0 };

export function currencyExponent(currency: CurrencyCode): number {
  const exp = CURRENCY_EXPONENT[currency];
  if (exp === undefined) throw new RangeError(`Unknown currency: ${currency}`);
  return exp;
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`amountMinor must be a safe integer: ${amountMinor}`);
  }
  currencyExponent(currency);
  return { amountMinor, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

/** Sum of same-currency amounts; `currency` is required so an empty list is well-defined. */
export function sumMoney(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, item) => addMoney(acc, item), money(0, currency));
}

/** Round to an integer, ties to the nearest even integer (banker's rounding). */
export function roundHalfEven(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`Cannot round ${value}`);
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export type ConversionResult =
  { ok: true; money: Money } | { ok: false; reason: "missing-rate"; money: Money };

/**
 * Convert to the base currency (BR-8). `rate` = base units per 1 unit of `m.currency`
 * (major units). Rounds half-even to base minor units, per transaction.
 * A missing/invalid rate yields `{ ok: false, reason: "missing-rate" }`, never an implicit 1.
 */
export function convertToBase(
  m: Money,
  base: CurrencyCode,
  rate: number | null | undefined,
): ConversionResult {
  if (m.currency === base) return { ok: true, money: m };
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    return { ok: false, reason: "missing-rate", money: m };
  }
  const scale = 10 ** (currencyExponent(base) - currencyExponent(m.currency));
  // toPrecision(15) strips binary-float noise (e.g. 2.4999999999999996) before tie detection.
  const exact = Number((m.amountMinor * rate * scale).toPrecision(15));
  return { ok: true, money: money(roundHalfEven(exact), base) };
}

/** Human formatting, e.g. "$1,234.50" or "₫50,000". */
export function formatMoney(m: Money, locale = "en-US"): string {
  const exp = currencyExponent(m.currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(m.amountMinor / 10 ** exp);
}
