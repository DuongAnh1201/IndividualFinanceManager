import { describe, expect, it } from "vitest";
import {
  addBottle,
  addExpense,
  addIncome,
  archiveCategory,
  archivePaymentMethod,
  createCategory,
  createPaymentMethod,
  getSuggestedLimit,
  renameBottle,
  setExchangeRate,
  setLivingLimit,
  snapshotClosedMonths,
  transferBetweenBottles,
  updateCategory,
  updatePaymentMethod,
  updateSettings,
} from "./index";
import { makeDeps } from "./testing/fakes";

function unwrap<T>(r: { ok: true; value: T } | { ok: false; errors: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
}
const codes = (r: { ok: boolean; errors?: { code: string }[] }) =>
  r.ok ? [] : (r.errors ?? []).map((e) => e.code);
const catInput = {
  name: "Pets",
  kind: "daily" as const,
  countsTowardLivingLimit: true,
  defaultBottleId: "N",
  color: "#aabbcc",
  mascot: "dog",
};
const expenseInput = {
  date: "2026-11-05",
  amountMinor: 2500,
  currency: "USD",
  categoryId: "food",
  paymentMethodId: "pm1",
};

describe("updateSettings", () => {
  const ok = { baseCurrency: "USD", payDays: [25, 10, 10], weekStartsOn: 0, timezone: "America/Los_Angeles" };
  it("normalises pay days and saves", () => {
    const d = makeDeps();
    const s = unwrap(updateSettings(d, ok));
    expect(s.payDays).toEqual([10, 25]);
    expect(d.store.settings.weekStartsOn).toBe(0);
  });
  it("reports all errors and saves nothing", () => {
    const d = makeDeps();
    const before = JSON.stringify(d.store.settings);
    const r = updateSettings(d, {
      baseCurrency: "EUR",
      payDays: [0, 40],
      weekStartsOn: 9,
      timezone: "Mars/Base",
    });
    expect(codes(r)).toEqual([
      "unknown-currency",
      "invalid-pay-days",
      "invalid-week-start",
      "invalid-timezone",
    ]);
    expect(JSON.stringify(d.store.settings)).toBe(before);
    expect(codes(updateSettings(d, { ...ok, payDays: [] }))).toEqual(["invalid-pay-days"]);
  });
  it("changing base currency drops saved snapshots; pay days alone does not", () => {
    const d = makeDeps({ today: "2027-01-05" });
    unwrap(addExpense(d, expenseInput));
    snapshotClosedMonths(d);
    unwrap(updateSettings(d, { ...ok, baseCurrency: "USD", weekStartsOn: 1, payDays: [5] }));
    expect(d.store.reports.size).toBe(2); // Nov + Dec snapshots survive
    unwrap(updateSettings(d, { ...ok, baseCurrency: "VND" }));
    expect(d.store.reports.size).toBe(0);
  });
});

describe("categories", () => {
  it("creates with trimmed name; rejects bad input", () => {
    const d = makeDeps();
    const c = unwrap(createCategory(d, { ...catInput, name: " Pets " }));
    expect(c).toMatchObject({ name: "Pets", archivedAt: null });
    expect(d.store.categories.some((x) => x.id === c.id)).toBe(true);
    expect(codes(createCategory(d, { ...catInput, name: "pets" }))).toEqual(["duplicate-name"]);
    expect(
      codes(
        createCategory(d, {
          ...catInput,
          name: " ",
          kind: "x" as never,
          color: "red",
          mascot: "",
          defaultBottleId: "zz",
        }),
      ),
    ).toEqual(["empty-name", "invalid-kind", "invalid-color", "empty-mascot", "unknown-bottle"]);
  });
  it("update keeps archivedAt, allows own name, drops snapshots; archive is soft", () => {
    const d = makeDeps({ today: "2027-01-05" });
    unwrap(addExpense(d, expenseInput));
    snapshotClosedMonths(d);
    const c = unwrap(
      updateCategory(d, "food", { ...catInput, name: "food", countsTowardLivingLimit: false }),
    );
    expect(c.countsTowardLivingLimit).toBe(false);
    expect(d.store.reports.size).toBe(0);
    expect(updateCategory(d, "zzz", catInput).ok).toBe(false);
    const a = unwrap(archiveCategory(d, "food"));
    expect(a.archivedAt).not.toBeNull();
    expect(addExpense(d, expenseInput).ok).toBe(false);
    expect(d.store.expenses).toHaveLength(1);
  });
  it("rejects an archived default bottle", () => {
    const d = makeDeps();
    d.store.bottles.find((b) => b.id === "P")!.archivedAt = "x";
    expect(codes(createCategory(d, { ...catInput, defaultBottleId: "P" }))).toEqual(["archived-bottle"]);
  });
});

describe("payment methods", () => {
  it("create / update / archive with validation", () => {
    const d = makeDeps();
    const m = unwrap(createPaymentMethod(d, { name: " Chase ", type: "credit", last4: "1234" }));
    expect(m.name).toBe("Chase");
    expect(codes(createPaymentMethod(d, { name: "", type: "x" as never, last4: "12" }))).toEqual([
      "empty-name",
      "invalid-type",
      "invalid-last4",
    ]);
    expect(unwrap(updatePaymentMethod(d, m.id, { name: "Chase 2", type: "debit", last4: null })).type).toBe(
      "debit",
    );
    expect(updatePaymentMethod(d, "zzz", { name: "a", type: "cash", last4: null }).ok).toBe(false);
    expect(unwrap(archivePaymentMethod(d, m.id)).archivedAt).not.toBeNull();
    expect(addExpense(d, { ...expenseInput, paymentMethodId: m.id }).ok).toBe(false);
  });
});

describe("exchange rate & living limit", () => {
  it("setExchangeRate upserts per month/currency and invalidates from that month", () => {
    const d = makeDeps({ today: "2027-01-05" });
    unwrap(addExpense(d, expenseInput)).expense; // Nov
    unwrap(addExpense(d, { ...expenseInput, date: "2026-12-05" }));
    snapshotClosedMonths(d);
    unwrap(setExchangeRate(d, { month: "2026-12", currency: "VND", rateToBase: 0.00004 }));
    expect([...d.store.reports.keys()]).toEqual(["2026-11"]);
    unwrap(setExchangeRate(d, { month: "2026-12", currency: "VND", rateToBase: 0.00005 }));
    expect(d.store.exchangeRates).toEqual([{ month: "2026-12", currency: "VND", rateToBase: 0.00005 }]);
  });
  it("validates rate input", () => {
    const d = makeDeps();
    expect(codes(setExchangeRate(d, { month: "2026-13", currency: "EUR", rateToBase: -1 }))).toEqual([
      "invalid-month",
      "unknown-currency",
      "invalid-rate",
    ]);
    expect(codes(setExchangeRate(d, { month: "2026-11", currency: "USD", rateToBase: 1 }))).toEqual([
      "base-currency",
    ]);
    expect(codes(setExchangeRate(d, { month: "2026-11", currency: "VND", rateToBase: 0 }))).toEqual([
      "invalid-rate",
    ]);
    expect(d.store.exchangeRates).toEqual([]);
  });
  it("setLivingLimit saves, validates, and suggests from Necessities allocations", () => {
    const d = makeDeps();
    expect(unwrap(setLivingLimit(d, { month: "2026-11", limitMinor: 123_00 }))).toEqual({
      month: "2026-11",
      limitMinor: 12300,
    });
    expect(codes(setLivingLimit(d, { month: "nope", limitMinor: -5 }))).toEqual([
      "invalid-month",
      "invalid-limit",
    ]);
    expect(codes(setLivingLimit(d, { month: "2026-11", limitMinor: 1.5 }))).toEqual(["invalid-limit"]);
    unwrap(addIncome(d, { date: "2026-11-10", amountMinor: 100_000, currency: "USD", source: "Salary" }));
    expect(unwrap(getSuggestedLimit(d, "2026-11"))).toEqual({ limitMinor: 50_000, missingRateIncomeIds: [] });
    expect(getSuggestedLimit(d, "bad").ok).toBe(false);
  });
});

describe("bottle admin", () => {
  it("addBottle appends with next sortOrder; rename keeps uniqueness", () => {
    const d = makeDeps();
    const b = unwrap(addBottle(d, { name: " Travel ", mascot: "plane" }));
    expect(b).toMatchObject({ name: "Travel", sortOrder: 6, archivedAt: null });
    expect(codes(addBottle(d, { name: "travel", mascot: "x" }))).toEqual(["duplicate-name"]);
    expect(codes(addBottle(d, { name: "", mascot: "" }))).toEqual(["empty-name", "empty-mascot"]);
    expect(unwrap(renameBottle(d, b.id, "Trips")).name).toBe("Trips");
    expect(codes(renameBottle(d, b.id, "N"))).toEqual(["duplicate-name"]);
    expect(renameBottle(d, "zzz", "x").ok).toBe(false);
    expect(renameBottle(d, b.id, "  ").ok).toBe(false);
  });
  it("transferBetweenBottles records a base-currency transfer and changes balances from its date", () => {
    const d = makeDeps({ today: "2027-01-05" });
    unwrap(addIncome(d, { date: "2026-11-10", amountMinor: 100_000, currency: "USD", source: "Salary" }));
    snapshotClosedMonths(d);
    const t = unwrap(
      transferBetweenBottles(d, {
        fromBottleId: "N",
        toBottleId: "P",
        amountMinor: 5_000,
        date: "2026-11-20",
        note: " rent ",
      }),
    );
    expect(t).toMatchObject({ currency: "USD", note: "rent", amountMinor: 5_000 });
    expect(d.store.transfers).toHaveLength(1);
    expect(d.store.reports.size).toBe(0);
  });
  it("transfer validation", () => {
    const d = makeDeps();
    d.store.bottles.find((b) => b.id === "G")!.archivedAt = "x";
    const r = transferBetweenBottles(d, {
      fromBottleId: "N",
      toBottleId: "N",
      amountMinor: 0,
      date: "2026-02-30",
    });
    expect(codes(r)).toEqual(["same-bottle", "invalid-amount", "invalid-date"]);
    expect(
      codes(
        transferBetweenBottles(d, {
          fromBottleId: "G",
          toBottleId: "zz",
          amountMinor: 1,
          date: "2026-11-01",
        }),
      ),
    ).toEqual(["unknown-bottle", "unknown-bottle"]);
    expect(d.store.transfers).toEqual([]);
  });
});
