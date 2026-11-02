import { isCurrencyCode } from "./money";
import { monthOf, parseDate } from "./period";
import type { Bottle, Category, CurrencyCode, ExchangeRate, Id, IsoDate, PaymentMethod } from "./types";

/** What the user (or a subscription) submits; untrusted shape, validated by `validateExpense`. */
export interface ExpenseInput {
  date: IsoDate;
  amountMinor: number;
  currency: string;
  /** Per-transaction rate (base units per 1 unit of `currency`); null/undefined = use the month's rate. */
  fxRateToBase?: number | null;
  categoryId: Id;
  paymentMethodId: Id;
  /** Omit/null to default to the category's default bottle. */
  bottleId?: Id | null;
  note?: string | null;
}

/** Reference data the rules need; loaded by the caller (db layer), not fetched here. */
export interface ExpenseContext {
  baseCurrency: CurrencyCode;
  categories: readonly Category[];
  paymentMethods: readonly PaymentMethod[];
  bottles: readonly Bottle[];
  exchangeRates: readonly ExchangeRate[];
}

export type ExpenseErrorCode =
  | "invalid-date"
  | "invalid-amount"
  | "unknown-currency"
  | "unknown-category"
  | "archived-category"
  | "unknown-payment-method"
  | "archived-payment-method"
  | "unknown-bottle"
  | "archived-bottle"
  | "invalid-fx-rate"
  | "missing-fx-rate";

export interface ExpenseError {
  code: ExpenseErrorCode;
  field: "date" | "amountMinor" | "currency" | "fxRateToBase" | "categoryId" | "paymentMethodId" | "bottleId";
  message: string;
}

/** Normalised expense fields, ready to persist (id and timestamps are added by the caller). */
export interface ValidExpense {
  date: IsoDate;
  amountMinor: number;
  currency: CurrencyCode;
  /** Snapshot of the rate used; null for base-currency expenses. */
  fxRateToBase: number | null;
  categoryId: Id;
  paymentMethodId: Id;
  bottleId: Id | null;
  note: string | null;
  /** Always manual: subscription expenses are built by BR-1 (with billingMonth), not here. */
  source: "manual";
  subscriptionId: null;
}

export type ExpenseValidation = { ok: true; value: ValidExpense } | { ok: false; errors: ExpenseError[] };

/** Rate in effect for `currency` in `month`: the month's `exchange_rate`, if any. */
export function monthRate(
  rates: readonly ExchangeRate[],
  month: string,
  currency: CurrencyCode,
): number | null {
  const found = rates.find((r) => r.month === month && r.currency === currency);
  return found && Number.isFinite(found.rateToBase) && found.rateToBase > 0 ? found.rateToBase : null;
}

/**
 * BR-2: validate an expense and fill defaults. Pure. Returns all errors at once.
 * - amount is a positive safe integer (minor units)
 * - category and payment method exist and are not archived
 * - bottleId defaults to the category's `defaultBottleId` (null if that bottle is archived/unknown, D-018); an explicit bottle must exist and be active
 * - manual only: source is always "manual"
 * - a non-base currency needs a per-transaction rate or the month's rate (snapshotted into the result)
 */
export function validateExpense(input: ExpenseInput, ctx: ExpenseContext): ExpenseValidation {
  const errors: ExpenseError[] = [];
  const fail = (code: ExpenseErrorCode, field: ExpenseError["field"], message: string) =>
    errors.push({ code, field, message });

  let month: string | null = null;
  try {
    parseDate(input.date);
    month = monthOf(input.date);
  } catch {
    fail("invalid-date", "date", `Invalid date: ${String(input.date)}`);
  }

  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    fail("invalid-amount", "amountMinor", "Amount must be a positive whole number of minor units.");
  }

  const currency = isCurrencyCode(input.currency) ? input.currency : null;
  if (!currency) fail("unknown-currency", "currency", `Unknown currency: ${String(input.currency)}`);

  const category = ctx.categories.find((c) => c.id === input.categoryId);
  if (!category) fail("unknown-category", "categoryId", "Unknown category.");
  else if (category.archivedAt) fail("archived-category", "categoryId", "Category is archived.");

  const method = ctx.paymentMethods.find((p) => p.id === input.paymentMethodId);
  if (!method) fail("unknown-payment-method", "paymentMethodId", "Unknown payment method.");
  else if (method.archivedAt)
    fail("archived-payment-method", "paymentMethodId", "Payment method is archived.");

  let bottleId: Id | null = null;
  if (input.bottleId != null) {
    const bottle = ctx.bottles.find((b) => b.id === input.bottleId);
    if (!bottle) fail("unknown-bottle", "bottleId", "Unknown bottle.");
    else if (bottle.archivedAt) fail("archived-bottle", "bottleId", "Bottle is archived.");
    else bottleId = bottle.id;
  } else {
    // D-018: an archived default bottle yields null (no error); the user didn't choose it.
    const fallback = category?.defaultBottleId;
    const def = fallback ? ctx.bottles.find((b) => b.id === fallback) : undefined;
    bottleId = def && !def.archivedAt ? def.id : null;
  }

  let fxRateToBase: number | null = null;
  if (currency && currency !== ctx.baseCurrency) {
    const given = input.fxRateToBase;
    if (given != null) {
      if (Number.isFinite(given) && given > 0) fxRateToBase = given;
      else fail("invalid-fx-rate", "fxRateToBase", "Exchange rate must be a positive number.");
    } else {
      const fallback = month ? monthRate(ctx.exchangeRates, month, currency) : null;
      if (fallback != null) fxRateToBase = fallback;
      else if (month) {
        fail("missing-fx-rate", "fxRateToBase", `No exchange rate for ${currency} in ${month}.`);
      }
    }
  }

  if (errors.length > 0 || !currency) return { ok: false, errors };

  return {
    ok: true,
    value: {
      date: input.date,
      amountMinor: input.amountMinor,
      currency,
      fxRateToBase,
      categoryId: input.categoryId,
      paymentMethodId: input.paymentMethodId,
      bottleId,
      note: input.note ?? null,
      source: "manual",
      subscriptionId: null,
    },
  };
}
