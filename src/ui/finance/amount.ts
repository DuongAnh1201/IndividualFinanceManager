import { currencyExponent } from "@/domain/money";
import type { CurrencyCode } from "@/domain/types";

/** Text formatting only: never round a stored integer or use grouped display text in inputs. */
export function amountInputValue(amountMinor: number, currency: CurrencyCode): string {
  const digits = currencyExponent(currency);
  const text = String(amountMinor).padStart(digits + 1, "0");
  return digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text;
}
