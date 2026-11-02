import type { CurrencyCode, Money } from "./types";

/** Minor-unit exponent per currency (ISO 4217, D-013). Extend when adding currencies. */
export const CURRENCY_EXPONENT: Record<CurrencyCode, number> = { USD: 2, VND: 0 };

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.hasOwn(CURRENCY_EXPONENT, value);
}

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

export type ParseMoneyError = "empty" | "invalid" | "too-many-decimals" | "too-large";

export type ParseMoneyResult = { ok: true; amountMinor: number } | { ok: false; error: ParseMoneyError };

/**
 * Parse user-typed text into integer minor units, with no floating point.
 * - `,` is a thousands separator (en-US style), `.` is the decimal point; spaces and a currency
 *   symbol/code ($, ₫, USD, VND) are ignored.
 * - USD (exponent 2): up to 2 decimals; more is an error (never silently rounded).
 * - VND (exponent 0): no decimals; a `.` followed by exactly 3 digits groups (e.g. "50.000") is
 *   read as a thousands separator, any other `.` is an error.
 * - No sign: negative/zero amounts are rejected by BR-2 (`validateExpense`), not here (a
 *   minus sign is "invalid"; "0" parses to 0).
 */
export function parseMoneyInput(text: string, currency: CurrencyCode): ParseMoneyResult {
  const exp = currencyExponent(currency);
  const cleaned = text
    .replace(/\s+/g, "")
    .replace(/^(?:USD|VND|\$|₫)/i, "")
    .replace(/(?:USD|VND|\$|₫)$/i, "");
  if (cleaned === "") return { ok: false, error: "empty" };

  let whole: string;
  let frac = "";
  if (exp === 0 && /^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    whole = cleaned.replaceAll(".", "");
  } else {
    const parts = cleaned.split(".");
    if (parts.length > 2) return { ok: false, error: "invalid" };
    whole = parts[0] ?? "";
    frac = parts[1] ?? "";
    if (whole.includes(",") && !/^\d{1,3}(?:,\d{3})+$/.test(whole)) return { ok: false, error: "invalid" };
    whole = whole.replaceAll(",", "");
    if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac) || (whole === "" && frac === "")) {
      return { ok: false, error: "invalid" };
    }
    if (frac.length > exp) {
      return { ok: false, error: "too-many-decimals" };
    }
  }

  const digits = (whole === "" ? "0" : whole) + frac.padEnd(exp, "0");
  const amountMinor = Number(digits);
  if (!Number.isSafeInteger(amountMinor)) return { ok: false, error: "too-large" };
  return { ok: true, amountMinor };
}
