import { describe, expect, it } from "vitest";
import { validateIncome } from "./income";

const ctx = {
  baseCurrency: "USD" as const,
  exchangeRates: [{ month: "2026-11", currency: "VND" as const, rateToBase: 0.00004 }],
};
const ok = { date: "2026-11-10", amountMinor: 300000, currency: "USD", source: "Salary" };
const codes = (r: ReturnType<typeof validateIncome>) => (r.ok ? [] : r.errors.map((e) => e.code));

describe("validateIncome", () => {
  it("accepts a base-currency income and normalises", () => {
    const r = validateIncome({ ...ok, source: "  Salary ", note: "  ", payDaySlot: "2026-11-10" }, ctx);
    expect(r).toEqual({
      ok: true,
      value: {
        date: "2026-11-10",
        amountMinor: 300000,
        currency: "USD",
        fxRateToBase: null,
        source: "Salary",
        note: null,
        payDaySlot: "2026-11-10",
      },
    });
  });

  it("snapshots the month rate for foreign currency, prefers an explicit rate", () => {
    const m = validateIncome({ ...ok, currency: "VND" }, ctx);
    expect(m.ok && m.value.fxRateToBase).toBe(0.00004);
    const e = validateIncome({ ...ok, currency: "VND", fxRateToBase: 0.00005 }, ctx);
    expect(e.ok && e.value.fxRateToBase).toBe(0.00005);
  });

  it("reports all errors at once", () => {
    const r = validateIncome(
      { date: "2026-13-40", amountMinor: 0, currency: "EUR", source: " ", payDaySlot: "nope" },
      ctx,
    );
    expect(codes(r)).toEqual([
      "invalid-date",
      "invalid-amount",
      "unknown-currency",
      "empty-source",
      "invalid-pay-day-slot",
    ]);
  });

  it("requires a rate for foreign currency when none exists", () => {
    expect(codes(validateIncome({ ...ok, currency: "VND", date: "2026-12-10" }, ctx))).toEqual([
      "missing-fx-rate",
    ]);
    expect(codes(validateIncome({ ...ok, currency: "VND", fxRateToBase: -1 }, ctx))).toEqual([
      "invalid-fx-rate",
    ]);
  });

  it("rejects fractional amounts", () => {
    expect(codes(validateIncome({ ...ok, amountMinor: 10.5 }, ctx))).toEqual(["invalid-amount"]);
  });
});
