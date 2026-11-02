import { isCurrencyCode, parseMoneyInput } from "@/domain/money";
import type { FormState } from "@/ui/finance/types";
export function text(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}
export function formFailure(errors: readonly { field: string; message: string }[]): FormState {
  return {
    error: errors.map((e) => e.message).join(" "),
    fields: Object.fromEntries(
      errors.map((e) => [e.field === "amountMinor" ? "amount" : e.field, e.message]),
    ),
  };
}
export function readMoney(data: FormData) {
  const currency = text(data, "currency");
  if (!isCurrencyCode(currency))
    return {
      ok: false as const,
      state: formFailure([{ field: "currency", message: "Choose a supported currency." }]),
    };
  const amount = parseMoneyInput(text(data, "amount"), currency);
  if (!amount.ok)
    return {
      ok: false as const,
      state: formFailure([
        {
          field: "amount",
          message:
            amount.error === "too-many-decimals"
              ? `Too many decimal places for ${currency}.`
              : amount.error === "too-large"
                ? "This amount is too large."
                : "Enter a valid amount.",
        },
      ]),
    };
  return { ok: true as const, currency, amountMinor: amount.amountMinor };
}
export function transactionInput(data: FormData) {
  const money = readMoney(data);
  if (!money.ok) return money;
  const rate = text(data, "fxRateToBase");
  return {
    ok: true as const,
    value: {
      currency: money.currency,
      amountMinor: money.amountMinor,
      date: text(data, "date"),
      note: text(data, "note") || null,
      fxRateToBase: rate ? Number(rate) : null,
    },
  };
}
