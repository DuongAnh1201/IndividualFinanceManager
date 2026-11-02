import { minorToDecimalString } from "./money";
import type { Bottle, Category, Expense, Income, PaymentMethod } from "./types";

/** Quote a field per RFC 4180 when it contains a comma, quote, CR or LF. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Spreadsheet formula-injection guard for free text (notes, names, sources): a cell starting with
 * `=`, `+`, `-`, `@`, tab or CR would be evaluated by Excel/Sheets, so prefix it with a quote.
 * Not applied to numbers or dates, which we generate ourselves.
 */
export function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Rows → CSV text: RFC 4180, CRLF line endings, a trailing CRLF. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvField).join(",") + "\r\n").join("");
}

/** Plain decimal for an FX rate (no exponent notation), up to 10 places, trailing zeros trimmed. */
function rateString(rate: number | null): string {
  if (rate === null) return "";
  return rate
    .toFixed(10)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

const text = (value: string | null | undefined): string => guardFormula(value ?? "");

const byDateThenId = <T extends { date: string; id: string }>(a: T, b: T) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

export interface ExpenseCsvContext {
  categories: readonly Category[];
  paymentMethods: readonly PaymentMethod[];
  bottles: readonly Bottle[];
}

export const EXPENSE_CSV_HEADER = [
  "id",
  "date",
  "amount",
  "currency",
  "fx_rate_to_base",
  "category",
  "payment_method",
  "bottle",
  "note",
  "source",
  "billing_month",
] as const;

/** Expenses as CSV, oldest first; amounts are exact decimal strings; names are resolved (id if unknown). */
export function expensesToCsv(expenses: readonly Expense[], ctx: ExpenseCsvContext): string {
  const categories = new Map(ctx.categories.map((c) => [c.id, c.name]));
  const methods = new Map(ctx.paymentMethods.map((p) => [p.id, p.name]));
  const bottles = new Map(ctx.bottles.map((b) => [b.id, b.name]));
  const rows = [...expenses]
    .sort(byDateThenId)
    .map((e) => [
      e.id,
      e.date,
      minorToDecimalString(e.amountMinor, e.currency),
      e.currency,
      rateString(e.fxRateToBase),
      text(categories.get(e.categoryId) ?? e.categoryId),
      text(methods.get(e.paymentMethodId) ?? e.paymentMethodId),
      e.bottleId ? text(bottles.get(e.bottleId) ?? e.bottleId) : "",
      text(e.note),
      e.source,
      e.billingMonth ?? "",
    ]);
  return toCsv([[...EXPENSE_CSV_HEADER], ...rows]);
}

export const INCOME_CSV_HEADER = [
  "id",
  "date",
  "amount",
  "currency",
  "fx_rate_to_base",
  "source",
  "note",
  "pay_day_slot",
] as const;

/** Incomes as CSV, oldest first. */
export function incomesToCsv(incomes: readonly Income[]): string {
  const rows = [...incomes]
    .sort(byDateThenId)
    .map((i) => [
      i.id,
      i.date,
      minorToDecimalString(i.amountMinor, i.currency),
      i.currency,
      rateString(i.fxRateToBase),
      text(i.source),
      text(i.note),
      i.payDaySlot ?? "",
    ]);
  return toCsv([[...INCOME_CSV_HEADER], ...rows]);
}
