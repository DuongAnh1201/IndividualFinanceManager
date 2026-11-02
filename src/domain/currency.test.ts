import { describe, expect, it } from "vitest";
import { toBaseMinor } from "./currency";

const rates = [{ month: "2026-11", currency: "VND" as const, rateToBase: 0.00004 }];
const vnd = (o = {}) => ({ amountMinor: 50_000, currency: "VND" as const, date: "2026-11-05", ...o });

describe("toBaseMinor (BR-8)", () => {
  it("base currency passes through", () => {
    expect(toBaseMinor({ amountMinor: 123, currency: "USD", date: "2026-11-05" }, "USD", [])).toBe(123);
  });
  it("own rate wins over the month's rate", () => {
    expect(toBaseMinor(vnd({ fxRateToBase: 0.00005 }), "USD", rates)).toBe(250);
  });
  it("falls back to the month's rate of the transaction date", () => {
    expect(toBaseMinor(vnd(), "USD", rates)).toBe(200);
  });
  it("null when no rate (never 1)", () => {
    expect(toBaseMinor(vnd({ date: "2026-12-01" }), "USD", rates)).toBeNull();
  });
  it("rounds half-even per transaction", () => {
    // 1 VND × 0.025 = 2.5¢ → 2 ; 3 VND × 0.025 = 7.5¢ → 8
    expect(toBaseMinor(vnd({ amountMinor: 1, fxRateToBase: 0.025 }), "USD", [])).toBe(2);
    expect(toBaseMinor(vnd({ amountMinor: 3, fxRateToBase: 0.025 }), "USD", [])).toBe(8);
  });
});
