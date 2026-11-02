import { describe, expect, it } from "vitest";
import { validateExpense, type ExpenseContext, type ExpenseInput } from "./expense";
import type { Bottle, Category, PaymentMethod } from "./types";

const bottle = (id: string, archivedAt: string | null = null): Bottle => ({
  id,
  name: id,
  mascot: "m",
  sortOrder: 0,
  archivedAt,
});
const category = (id: string, over: Partial<Category> = {}): Category => ({
  id,
  name: id,
  kind: "daily",
  countsTowardLivingLimit: true,
  defaultBottleId: "necessities",
  color: "#fff",
  mascot: "m",
  archivedAt: null,
  ...over,
});
const method = (id: string, archivedAt: string | null = null): PaymentMethod => ({
  id,
  name: id,
  type: "debit",
  last4: null,
  archivedAt,
});

const ctx: ExpenseContext = {
  baseCurrency: "USD",
  categories: [
    category("groceries"),
    category("old", { archivedAt: "2026-01-01T00:00:00Z" }),
    category("nodefault", { defaultBottleId: null }),
    category("dining", { defaultBottleId: "play" }),
  ],
  paymentMethods: [method("visa"), method("oldcard", "2026-01-01T00:00:00Z")],
  bottles: [bottle("necessities"), bottle("play"), bottle("gone", "2026-01-01T00:00:00Z")],
  exchangeRates: [{ month: "2026-11", currency: "VND", rateToBase: 0.00004 }],
};

const base: ExpenseInput = {
  date: "2026-11-05",
  amountMinor: 1250,
  currency: "USD",
  categoryId: "groceries",
  paymentMethodId: "visa",
};

const codes = (input: ExpenseInput, c = ctx) => {
  const r = validateExpense(input, c);
  return r.ok ? [] : r.errors.map((e) => e.code);
};

describe("validateExpense (BR-2)", () => {
  it("accepts a valid base-currency expense and applies defaults", () => {
    expect(validateExpense(base, ctx)).toEqual({
      ok: true,
      value: {
        date: "2026-11-05",
        amountMinor: 1250,
        currency: "USD",
        fxRateToBase: null,
        categoryId: "groceries",
        paymentMethodId: "visa",
        bottleId: "necessities",
        note: null,
        source: "manual",
        subscriptionId: null,
      },
    });
  });

  it.each([0, -5, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2])("rejects amount %s", (amountMinor) => {
    expect(codes({ ...base, amountMinor })).toEqual(["invalid-amount"]);
  });

  it("rejects bad dates", () => {
    expect(codes({ ...base, date: "2026-02-30" })).toEqual(["invalid-date"]);
    expect(codes({ ...base, date: "nope" })).toEqual(["invalid-date"]);
  });

  it("rejects unknown currency", () => {
    expect(codes({ ...base, currency: "EUR" })).toEqual(["unknown-currency"]);
  });

  it("rejects unknown/archived category and payment method", () => {
    expect(codes({ ...base, categoryId: "x" })).toEqual(["unknown-category"]);
    expect(codes({ ...base, categoryId: "old" })).toEqual(["archived-category"]);
    expect(codes({ ...base, paymentMethodId: "x" })).toEqual(["unknown-payment-method"]);
    expect(codes({ ...base, paymentMethodId: "oldcard" })).toEqual(["archived-payment-method"]);
  });

  it("collects multiple errors", () => {
    expect(codes({ ...base, amountMinor: 0, categoryId: "x", paymentMethodId: "y" })).toEqual([
      "invalid-amount",
      "unknown-category",
      "unknown-payment-method",
    ]);
  });

  describe("bottle defaulting", () => {
    it("uses the category's default bottle", () => {
      const r = validateExpense({ ...base, categoryId: "dining" }, ctx);
      expect(r.ok && r.value.bottleId).toBe("play");
    });
    it("explicit bottle overrides the default", () => {
      const r = validateExpense({ ...base, bottleId: "play" }, ctx);
      expect(r.ok && r.value.bottleId).toBe("play");
    });
    it("null when the category has no default", () => {
      const r = validateExpense({ ...base, categoryId: "nodefault" }, ctx);
      expect(r.ok && r.value.bottleId).toBeNull();
    });
    it("rejects unknown or archived explicit bottle", () => {
      expect(codes({ ...base, bottleId: "x" })).toEqual(["unknown-bottle"]);
      expect(codes({ ...base, bottleId: "gone" })).toEqual(["archived-bottle"]);
    });
  });

  describe("foreign currency", () => {
    const vnd: ExpenseInput = { ...base, currency: "VND", amountMinor: 50_000 };
    it("uses the per-transaction rate when given", () => {
      const r = validateExpense({ ...vnd, fxRateToBase: 0.00005 }, ctx);
      expect(r.ok && r.value.fxRateToBase).toBe(0.00005);
    });
    it("falls back to (and snapshots) the month's rate", () => {
      const r = validateExpense(vnd, ctx);
      expect(r.ok && r.value.fxRateToBase).toBe(0.00004);
    });
    it("requires a rate when neither exists", () => {
      expect(codes({ ...vnd, date: "2026-12-01" })).toEqual(["missing-fx-rate"]);
    });
    it("rejects non-positive per-transaction rates (does not fall back)", () => {
      expect(codes({ ...vnd, fxRateToBase: 0 })).toEqual(["invalid-fx-rate"]);
      expect(codes({ ...vnd, fxRateToBase: -1 })).toEqual(["invalid-fx-rate"]);
      expect(codes({ ...vnd, fxRateToBase: NaN })).toEqual(["invalid-fx-rate"]);
    });
    it("ignores a supplied rate for base-currency expenses", () => {
      const r = validateExpense({ ...base, fxRateToBase: 3 }, ctx);
      expect(r.ok && r.value.fxRateToBase).toBeNull();
    });
  });

  it("keeps source/subscription link and note", () => {
    const r = validateExpense(
      { ...base, source: "subscription", subscriptionId: "s1", note: "Netflix" },
      ctx,
    );
    expect(r.ok && [r.value.source, r.value.subscriptionId, r.value.note]).toEqual([
      "subscription",
      "s1",
      "Netflix",
    ]);
  });
});
