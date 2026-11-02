import { describe, expect, it } from "vitest";
import { formFailure, readMoney, text, transactionInput } from "./form-data";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
};
describe("finance form boundary", () => {
  it("parses USD exactly and VND as whole minor units", () => {
    expect(readMoney(form({ currency: "USD", amount: "0.29" }))).toMatchObject({ ok: true, amountMinor: 29 });
    expect(readMoney(form({ currency: "VND", amount: "50,000" }))).toMatchObject({
      ok: true,
      amountMinor: 50000,
    });
  });
  it("rejects unsupported currency, excess decimals and unsafe values before persistence", () => {
    expect(readMoney(form({ currency: "EUR", amount: "1" }))).toMatchObject({
      ok: false,
      state: { fields: { currency: expect.any(String) } },
    });
    expect(readMoney(form({ currency: "USD", amount: "1.005" }))).toMatchObject({
      ok: false,
      state: { fields: { amount: expect.any(String) } },
    });
    expect(readMoney(form({ currency: "USD", amount: "9007199254740992" }))).toMatchObject({ ok: false });
  });
  it("leaves a missing FX rate null for the service fallback and passes invalid rates to validation", () => {
    expect(transactionInput(form({ currency: "VND", amount: "50", date: "2026-11-01" }))).toMatchObject({
      ok: true,
      value: { fxRateToBase: null },
    });
    const parsed = transactionInput(form({ currency: "VND", amount: "50", fxRateToBase: "oops" }));
    expect(parsed.ok && Number.isNaN(parsed.value.fxRateToBase)).toBe(true);
  });
  it("maps domain amount errors to the visible amount input", () => {
    expect(formFailure([{ field: "amountMinor", message: "Must be positive" }])).toEqual({
      error: "Must be positive",
      fields: { amount: "Must be positive" },
    });
  });
  it("does not coerce uploaded files or missing fields into values", () => {
    const data = new FormData();
    data.set("note", new Blob(["file"]), "note.txt");
    expect(text(data, "note")).toBe("");
    expect(text(data, "missing")).toBe("");
  });
});
