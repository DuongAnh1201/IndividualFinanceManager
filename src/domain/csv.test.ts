import { describe, expect, it } from "vitest";
import { csvField, expensesToCsv, guardFormula, incomesToCsv, toCsv } from "./csv";
import { minorToDecimalString } from "./money";
import type { Bottle, Category, Expense, Income, PaymentMethod } from "./types";

describe("minorToDecimalString", () => {
  it.each([
    [1250, "USD", "12.50"],
    [5, "USD", "0.05"],
    [0, "USD", "0.00"],
    [100, "USD", "1.00"],
    [-5, "USD", "-0.05"],
    [-123456, "USD", "-1234.56"],
    [50000, "VND", "50000"],
    [0, "VND", "0"],
    [-7, "VND", "-7"],
  ] as const)("%d %s → %s", (n, cur, out) => {
    expect(minorToDecimalString(n, cur)).toBe(out);
  });
  it("rejects non-integers", () => {
    expect(() => minorToDecimalString(1.5, "USD")).toThrow();
  });
});

describe("csvField / toCsv (RFC 4180)", () => {
  it("quotes commas, quotes, CR and LF; doubles quotes", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("cr\r")).toBe('"cr\r"');
    expect(csvField("")).toBe("");
  });
  it("joins with CRLF and a trailing CRLF", () => {
    expect(
      toCsv([
        ["a", "b,c"],
        ["1", "2"],
      ]),
    ).toBe('a,"b,c"\r\n1,2\r\n');
  });
});

describe("guardFormula", () => {
  it.each(["=SUM(A1)", "+1", "-1+2", "@cmd", "\tx", "\rx"])("prefixes %j", (s) => {
    expect(guardFormula(s)).toBe(`'${s}`);
  });
  it.each(["hello", "a=b", "", "1+1", " =x"])("leaves %j", (s) => {
    expect(guardFormula(s)).toBe(s);
  });
});

const cat = (id: string, name: string): Category => ({
  id,
  name,
  kind: "daily",
  countsTowardLivingLimit: true,
  defaultBottleId: null,
  color: "#fff",
  mascot: "m",
  archivedAt: null,
});
const pm = (id: string, name: string): PaymentMethod => ({
  id,
  name,
  type: "credit",
  last4: null,
  archivedAt: null,
});
const bottle = (id: string, name: string): Bottle => ({
  id,
  name,
  mascot: "m",
  sortOrder: 0,
  archivedAt: null,
});

const exp = (o: Partial<Expense>): Expense => ({
  id: "e1",
  date: "2026-11-05",
  amountMinor: 1250,
  currency: "USD",
  fxRateToBase: null,
  categoryId: "food",
  paymentMethodId: "visa",
  bottleId: "nec",
  note: null,
  source: "manual",
  subscriptionId: null,
  billingMonth: null,
  createdAt: "",
  updatedAt: "",
  ...o,
});

const ctx = {
  categories: [cat("food", "Groceries/Daily")],
  paymentMethods: [pm("visa", "Chase Visa")],
  bottles: [bottle("nec", "Necessities")],
};

describe("expensesToCsv", () => {
  it("header, resolved names, decimal amounts, ISO dates", () => {
    const csv = expensesToCsv([exp({})], ctx);
    expect(csv).toBe(
      "id,date,amount,currency,fx_rate_to_base,category,payment_method,bottle,note,source,billing_month\r\n" +
        "e1,2026-11-05,12.50,USD,,Groceries/Daily,Chase Visa,Necessities,,manual,\r\n",
    );
  });
  it("VND, fx rate without exponent notation, subscription billing month", () => {
    const csv = expensesToCsv(
      [
        exp({
          currency: "VND",
          amountMinor: 50000,
          fxRateToBase: 0.00004,
          source: "subscription",
          billingMonth: "2026-11",
        }),
      ],
      ctx,
    );
    expect(csv.split("\r\n")[1]).toBe(
      "e1,2026-11-05,50000,VND,0.00004,Groceries/Daily,Chase Visa,Necessities,,subscription,2026-11",
    );
    const tiny = expensesToCsv([exp({ fxRateToBase: 1e-7 })], ctx).split("\r\n")[1];
    expect(tiny).toContain(",0.0000001,");
    expect(expensesToCsv([exp({ fxRateToBase: 25000 })], ctx).split("\r\n")[1]).toContain(",25000,");
  });
  it("quotes notes and guards formula injection", () => {
    const csv = expensesToCsv(
      [
        exp({ id: "a", note: '=HYPERLINK("http://x")' }),
        exp({ id: "b", note: 'lunch, with "friends"' }),
        exp({ id: "c", note: "-2+3" }),
      ],
      ctx,
    );
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(lines[2]).toContain('"lunch, with ""friends"""');
    expect(lines[3]).toContain(",'-2+3,");
  });
  it("guards names too, falls back to ids for unknown refs, null bottle empty", () => {
    const evil = { ...ctx, categories: [cat("food", "=evil")] };
    const line = expensesToCsv([exp({ paymentMethodId: "gone", bottleId: null })], evil).split("\r\n")[1];
    expect(line).toBe("e1,2026-11-05,12.50,USD,,'=evil,gone,,,manual,");
  });
  it("sorts by date then id; empty list is header only", () => {
    const csv = expensesToCsv(
      [
        exp({ id: "b", date: "2026-11-02" }),
        exp({ id: "a", date: "2026-11-03" }),
        exp({ id: "c", date: "2026-11-02" }),
      ],
      ctx,
    );
    expect(
      csv
        .split("\r\n")
        .slice(1, 4)
        .map((l) => l.split(",")[0]),
    ).toEqual(["b", "c", "a"]);
    expect(expensesToCsv([], ctx).split("\r\n")).toHaveLength(2);
  });
});

describe("incomesToCsv", () => {
  const inc = (o: Partial<Income>): Income => ({
    id: "i1",
    date: "2026-11-10",
    amountMinor: 500000,
    currency: "USD",
    fxRateToBase: null,
    source: "Salary",
    note: null,
    payDaySlot: "2026-11-10",
    bottleRuleVersionId: "v1",
    ...o,
  });
  it("serialises with header and decimals", () => {
    expect(incomesToCsv([inc({})])).toBe(
      "id,date,amount,currency,fx_rate_to_base,source,note,pay_day_slot\r\n" +
        "i1,2026-11-10,5000.00,USD,,Salary,,2026-11-10\r\n",
    );
  });
  it("guards source and note", () => {
    const line = incomesToCsv([inc({ source: "+cmd", note: "@x", payDaySlot: null })]).split("\r\n")[1];
    expect(line).toBe("i1,2026-11-10,5000.00,USD,,'+cmd,'@x,");
  });
});
