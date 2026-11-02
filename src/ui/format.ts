import { formatMoney } from "@/domain/money";
import type { CurrencyCode } from "@/domain/types";

/** Money for display only; the amounts themselves come from services as integer minor units. */
export function money(amountMinor: number, currency: CurrencyCode): string {
  return formatMoney({ amountMinor, currency });
}

/** "Nov 12" style label for a YYYY-MM-DD date. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "November 2026" for a YYYY-MM month id. */
export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
