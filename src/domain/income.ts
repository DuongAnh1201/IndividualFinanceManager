import { monthRate } from "./expense";
import { isCurrencyCode } from "./money";
import { monthOf, parseDate } from "./period";
import type { CurrencyCode, ExchangeRate, Income, IsoDate } from "./types";

export interface IncomeInput {
  date: IsoDate;
  amountMinor: number;
  currency: string;
  /** Per-income rate (base units per 1 unit); null/undefined = use the month's rate. */
  fxRateToBase?: number | null;
  source: string;
  note?: string | null;
  /** Pay day this income resolves (BR-5), e.g. "2026-11-10". */
  payDaySlot?: IsoDate | null;
}

export interface IncomeContext {
  baseCurrency: CurrencyCode;
  exchangeRates: readonly ExchangeRate[];
}

export type IncomeErrorCode =
  | "invalid-date"
  | "invalid-amount"
  | "unknown-currency"
  | "invalid-fx-rate"
  | "missing-fx-rate"
  | "empty-source"
  | "invalid-pay-day-slot";

export interface IncomeError {
  code: IncomeErrorCode;
  field: "date" | "amountMinor" | "currency" | "fxRateToBase" | "source" | "payDaySlot";
  message: string;
}

/** Normalised income fields, ready to persist (id and bottleRuleVersionId added by the caller). */
export type ValidIncome = Pick<
  Income,
  "date" | "amountMinor" | "currency" | "fxRateToBase" | "source" | "note" | "payDaySlot"
>;

export type IncomeValidation = { ok: true; value: ValidIncome } | { ok: false; errors: IncomeError[] };

/**
 * Validate an income (mirrors BR-2 for expenses): positive integer amount, known currency,
 * non-empty source, valid dates, and for non-base currency a rate (own, else the month's —
 * snapshotted into `fxRateToBase`). Pure. Returns all errors at once.
 */
export function validateIncome(input: IncomeInput, ctx: IncomeContext): IncomeValidation {
  const errors: IncomeError[] = [];
  const fail = (code: IncomeErrorCode, field: IncomeError["field"], message: string) =>
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

  const source = typeof input.source === "string" ? input.source.trim() : "";
  if (source === "") fail("empty-source", "source", "Source must not be empty.");

  let payDaySlot: IsoDate | null = null;
  if (input.payDaySlot != null) {
    try {
      parseDate(input.payDaySlot);
      payDaySlot = input.payDaySlot;
    } catch {
      fail("invalid-pay-day-slot", "payDaySlot", `Invalid pay day: ${String(input.payDaySlot)}`);
    }
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
      else if (month)
        fail("missing-fx-rate", "fxRateToBase", `No exchange rate for ${currency} in ${month}.`);
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
      source,
      note: input.note?.trim() ? input.note.trim() : null,
      payDaySlot,
    },
  };
}
