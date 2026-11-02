import { describe, expect, it } from "vitest";
import { bottleBalances } from "./bottleBalances";
import type { BottleAllocation, BottleTransfer, ExchangeRate, Expense } from "./types";

const bottles = [{ id: "N" }, { id: "P" }];
const income = (
  id: string,
  date: string,
  currency: "USD" | "VND" = "USD",
  fxRateToBase: number | null = null,
) => ({
  id,
  date,
  currency,
  fxRateToBase,
});
const alloc = (incomeId: string, bottleId: string, amountMinor: number): BottleAllocation => ({
  id: `${incomeId}-${bottleId}`,
  incomeId,
  bottleId,
  amountMinor,
});
const transfer = (
  from: string,
  to: string,
  amountMinor: number,
  date = "2026-11-05",
  currency: "USD" | "VND" = "USD",
): BottleTransfer => ({
  id: `t-${from}-${to}-${amountMinor}`,
  fromBottleId: from,
  toBottleId: to,
  amountMinor,
  currency,
  date,
  note: null,
});
const expense = (o: Partial<Expense>): Expense => ({
  id: "e1",
  date: "2026-11-03",
  amountMinor: 100,
  currency: "USD",
  fxRateToBase: null,
  categoryId: "c",
  paymentMethodId: "pm",
  bottleId: "N",
  note: null,
  source: "manual",
  subscriptionId: null,
  billingMonth: null,
  createdAt: "x",
  updatedAt: "x",
  ...o,
});
const rates: ExchangeRate[] = [{ month: "2026-11", currency: "VND", rateToBase: 0.00004 }];
const run = (o: {
  allocations?: BottleAllocation[];
  incomes?: ReturnType<typeof income>[];
  transfers?: BottleTransfer[];
  expenses?: Expense[];
  rates?: ExchangeRate[];
}) =>
  bottleBalances(
    bottles,
    o.allocations ?? [],
    o.incomes ?? [],
    o.transfers ?? [],
    o.expenses ?? [],
    "USD",
    o.rates ?? rates,
  );
const bal = (r: ReturnType<typeof run>) => r.balances.map((b) => b.balanceMinor);

describe("bottleBalances", () => {
  it("is zero with no data, one entry per bottle in order", () => {
    const r = run({});
    expect(r.balances).toEqual([
      { bottleId: "N", balanceMinor: 0 },
      { bottleId: "P", balanceMinor: 0 },
    ]);
    expect(r.missingRate).toEqual({ incomeIds: [], transferIds: [], expenseIds: [] });
  });

  it("allocations − expenses ± transfers", () => {
    const r = run({
      incomes: [income("i1", "2026-11-01")],
      allocations: [alloc("i1", "N", 5000), alloc("i1", "P", 1000)],
      transfers: [transfer("N", "P", 300)],
      expenses: [expense({ amountMinor: 700 }), expense({ id: "e2", bottleId: "P", amountMinor: 50 })],
    });
    expect(bal(r)).toEqual([5000 - 300 - 700, 1000 + 300 - 50]);
  });

  it("can go negative", () => {
    expect(bal(run({ expenses: [expense({ amountMinor: 250 })] }))).toEqual([-250, 0]);
  });

  it("ignores expenses without a bottle and rows for unknown bottles", () => {
    const r = run({
      incomes: [income("i1", "2026-11-01")],
      allocations: [alloc("i1", "X", 999)],
      expenses: [expense({ bottleId: null })],
      transfers: [transfer("X", "N", 40)],
    });
    expect(bal(r)).toEqual([40, 0]);
  });

  it("converts allocations with the income's own rate before the month rate", () => {
    // 1,000,000 VND at 0.00004 → 40.00 USD (4000 cents); own rate 0.00005 → 50.00
    const own = run({
      incomes: [income("i1", "2026-11-01", "VND", 0.00005)],
      allocations: [alloc("i1", "N", 1_000_000)],
    });
    expect(bal(own)).toEqual([5000, 0]);
    const month = run({
      incomes: [income("i1", "2026-11-01", "VND")],
      allocations: [alloc("i1", "N", 1_000_000)],
    });
    expect(bal(month)).toEqual([4000, 0]);
  });

  it("converts expenses and transfers (month rate of their date)", () => {
    const r = run({
      incomes: [income("i1", "2026-11-01")],
      allocations: [alloc("i1", "N", 10_000)],
      expenses: [expense({ currency: "VND", amountMinor: 250_000 })], // 10.00 USD
      transfers: [transfer("N", "P", 500_000, "2026-11-20", "VND")], // 20.00 USD
    });
    expect(bal(r)).toEqual([10_000 - 1000 - 2000, 2000]);
  });

  it("reports missing rates and excludes them (never rate 1)", () => {
    const r = run({
      rates: [],
      incomes: [income("i1", "2026-11-01", "VND"), income("i2", "2026-11-01")],
      allocations: [alloc("i1", "N", 1_000_000), alloc("i1", "P", 5), alloc("i2", "N", 100)],
      expenses: [expense({ id: "eX", currency: "VND", amountMinor: 1000 })],
      transfers: [transfer("N", "P", 10, "2026-11-02", "VND")],
    });
    expect(bal(r)).toEqual([100, 0]);
    expect(r.missingRate).toEqual({ incomeIds: ["i1"], transferIds: ["t-N-P-10"], expenseIds: ["eX"] });
  });

  it("rounds per transaction, then sums", () => {
    // 1 VND at 0.00004 = 0.00004 USD = 0.004 cents → rounds to 0 each time
    const r = run({
      expenses: [
        expense({ id: "a", currency: "VND", amountMinor: 1 }),
        expense({ id: "b", currency: "VND", amountMinor: 1 }),
      ],
    });
    expect(bal(r)).toEqual([0, 0]);
  });
});
