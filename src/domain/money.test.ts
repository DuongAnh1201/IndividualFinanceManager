import { describe, expect, it } from "vitest";
import {
  addMoney,
  convertToBase,
  currencyExponent,
  formatMoney,
  money,
  roundHalfEven,
  subtractMoney,
  sumMoney,
} from "./money";

describe("money basics", () => {
  it("exponents", () => {
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("VND")).toBe(0);
  });
  it("rejects non-integer amounts", () => {
    expect(() => money(1.5, "USD")).toThrow();
    expect(() => money(NaN, "USD")).toThrow();
  });
  it("add / subtract / sum", () => {
    expect(addMoney(money(10, "USD"), money(5, "USD"))).toEqual(money(15, "USD"));
    expect(subtractMoney(money(10, "USD"), money(15, "USD"))).toEqual(money(-5, "USD"));
    expect(sumMoney([money(1, "VND"), money(2, "VND"), money(3, "VND")], "VND")).toEqual(money(6, "VND"));
    expect(sumMoney([], "USD")).toEqual(money(0, "USD"));
  });
  it("throws on currency mismatch", () => {
    expect(() => addMoney(money(1, "USD"), money(1, "VND"))).toThrow(/mismatch/);
    expect(() => sumMoney([money(1, "VND")], "USD")).toThrow(/mismatch/);
  });
  it("sums without float drift", () => {
    const items = Array.from({ length: 10 }, () => money(10, "USD")); // ten dimes
    expect(sumMoney(items, "USD").amountMinor).toBe(100);
  });
});

describe("roundHalfEven", () => {
  it.each([
    [0.5, 0],
    [1.5, 2],
    [2.5, 2],
    [3.5, 4],
    [-0.5, 0],
    [-1.5, -2],
    [-2.5, -2],
    [2.4, 2],
    [2.6, 3],
    [-2.6, -3],
  ])("%d → %d", (input, expected) => {
    expect(roundHalfEven(input)).toBe(expected);
  });
  it("rejects non-finite", () => {
    expect(() => roundHalfEven(Infinity)).toThrow();
  });
});

describe("convertToBase (BR-8)", () => {
  it("same currency passes through, rate ignored", () => {
    expect(convertToBase(money(500, "USD"), "USD", null)).toEqual({ ok: true, money: money(500, "USD") });
  });
  it("VND → USD adjusts exponents", () => {
    // 50,000 VND at 0.00004 USD/VND = 2.00 USD = 200 cents
    expect(convertToBase(money(50_000, "VND"), "USD", 0.00004)).toEqual({
      ok: true,
      money: money(200, "USD"),
    });
  });
  it("USD → VND", () => {
    // $10.00 at 25,000 VND/USD
    expect(convertToBase(money(1000, "USD"), "VND", 25_000)).toEqual({
      ok: true,
      money: money(250_000, "VND"),
    });
  });
  it("rounds half-even on ties", () => {
    // 1 VND at 0.025 USD → 2.5 cents → 2 ; 3 VND at 0.025 → 7.5 cents → 8
    expect(convertToBase(money(1, "VND"), "USD", 0.025)).toEqual({ ok: true, money: money(2, "USD") });
    expect(convertToBase(money(3, "VND"), "USD", 0.025)).toEqual({ ok: true, money: money(8, "USD") });
  });
  it("flags a missing or invalid rate instead of assuming 1", () => {
    for (const rate of [null, undefined, 0, -1, NaN]) {
      const r = convertToBase(money(100, "VND"), "USD", rate);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("missing-rate");
    }
  });
});

describe("formatMoney", () => {
  it("USD", () => {
    expect(formatMoney(money(123450, "USD"))).toBe("$1,234.50");
    expect(formatMoney(money(5, "USD"))).toBe("$0.05");
    expect(formatMoney(money(-250, "USD"))).toBe("-$2.50");
  });
  it("VND has no decimals", () => {
    expect(formatMoney(money(50000, "VND"))).toBe("₫50,000");
  });
});
