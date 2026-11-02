import { describe, expect, it } from "vitest";
import {
  changeSubscriptionPrice,
  chargeKey,
  endSubscription,
  monthlyTotalsByCurrency,
  nextChargeDate,
  owedCharges,
  postDueSubscriptionExpenses,
  validateSubscription,
} from "./subscriptions";
import type { Subscription } from "./types";

const NOW = "2026-11-01T00:00:00Z";
const sub = (o: Partial<Subscription> = {}): Subscription => ({
  id: "s1",
  name: "Netflix",
  amountMinor: 1599,
  currency: "USD",
  categoryId: "cat-sub",
  paymentMethodId: "pm1",
  billingDay: 15,
  startDate: "2026-01-10",
  endDate: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...o,
});
const cats = [{ id: "cat-sub", defaultBottleId: "necessities" }];
let n = 0;
const run = (subs: Subscription[], today: string, posted: string[] = []) =>
  postDueSubscriptionExpenses({
    subscriptions: subs,
    postedKeys: new Set(posted),
    categories: cats,
    today,
    now: NOW,
    newId: () => `e${++n}`,
  });

describe("owedCharges (BR-1)", () => {
  it("is not owed before the charge date, owed on it", () => {
    expect(owedCharges(sub(), "2026-01-14")).toEqual([]);
    expect(owedCharges(sub(), "2026-01-15").map((c) => c.billingMonth)).toEqual(["2026-01"]);
  });

  it("skips the start month when billing day is before the start date", () => {
    const s = sub({ startDate: "2026-01-20" });
    expect(owedCharges(s, "2026-02-14")).toEqual([]);
    expect(owedCharges(s, "2026-02-15").map((c) => c.billingMonth)).toEqual(["2026-02"]);
  });

  it("catches up every missed month", () => {
    expect(owedCharges(sub(), "2026-04-20").map((c) => c.billingMonth)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });

  it("clamps day 31 to month end, incl. leap years", () => {
    const s = sub({ billingDay: 31, startDate: "2027-12-01" });
    const dates = owedCharges(s, "2028-03-31").map((c) => c.chargeDate);
    expect(dates).toEqual(["2027-12-31", "2028-01-31", "2028-02-29", "2028-03-31"]);
    expect(owedCharges(sub({ billingDay: 31, startDate: "2026-02-01" }), "2026-02-28")[0]?.chargeDate).toBe(
      "2026-02-28",
    );
  });

  it("crosses year boundaries", () => {
    const s = sub({ startDate: "2026-11-01" });
    expect(owedCharges(s, "2027-01-15").map((c) => c.billingMonth)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("stops at endDate (charge date after end is not owed; on end is)", () => {
    const s = sub({ endDate: "2026-03-15" });
    expect(owedCharges(s, "2026-12-31").map((c) => c.billingMonth)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(owedCharges(sub({ endDate: "2026-03-14" }), "2026-12-31")).toHaveLength(2);
  });

  it("is empty when not started yet", () => {
    expect(owedCharges(sub({ startDate: "2027-01-01" }), "2026-12-31")).toEqual([]);
  });
});

describe("postDueSubscriptionExpenses (BR-1)", () => {
  it("creates subscription-sourced expenses with defaults", () => {
    const out = run([sub({ startDate: "2026-03-01" })], "2026-03-20");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: "2026-03-15",
      amountMinor: 1599,
      currency: "USD",
      fxRateToBase: null,
      categoryId: "cat-sub",
      bottleId: "necessities",
      source: "subscription",
      subscriptionId: "s1",
      billingMonth: "2026-03",
      createdAt: NOW,
    });
  });

  it("is idempotent: skips already-posted months", () => {
    const first = run([sub()], "2026-03-20");
    expect(first).toHaveLength(3);
    const posted = first.map((e) => chargeKey(e.subscriptionId!, e.billingMonth!));
    expect(run([sub()], "2026-03-20", posted)).toEqual([]);
    expect(run([sub()], "2026-04-20", posted).map((e) => e.billingMonth)).toEqual(["2026-04"]);
  });

  it("fills only the gap when a middle month is missing", () => {
    const out = run([sub()], "2026-04-20", [chargeKey("s1", "2026-01"), chargeKey("s1", "2026-03")]);
    expect(out.map((e) => e.billingMonth)).toEqual(["2026-02", "2026-04"]);
  });

  it("handles multiple subscriptions independently", () => {
    const out = run([sub(), sub({ id: "s2", billingDay: 1, startDate: "2026-01-01" })], "2026-02-10");
    expect(out.filter((e) => e.subscriptionId === "s2")).toHaveLength(2);
    expect(out.filter((e) => e.subscriptionId === "s1")).toHaveLength(1);
  });

  it("uses null bottle when the category is unknown or has no default", () => {
    const out = postDueSubscriptionExpenses({
      subscriptions: [sub({ startDate: "2026-03-01", categoryId: "x" })],
      postedKeys: new Set(),
      categories: cats,
      today: "2026-03-20",
      now: NOW,
      newId: () => "e",
    });
    expect(out[0]?.bottleId).toBeNull();
  });

  it("price change affects only charges posted afterwards", () => {
    const posted = run([sub()], "2026-02-20");
    const keys = posted.map((e) => chargeKey("s1", e.billingMonth!));
    const raised = changeSubscriptionPrice(sub(), 1999, NOW);
    const next = run([raised], "2026-03-20", keys);
    expect(posted.every((e) => e.amountMinor === 1599)).toBe(true);
    expect(next).toHaveLength(1);
    expect(next[0]?.amountMinor).toBe(1999);
  });

  it("removal sets endDate: no future posts, past ones untouched", () => {
    const ended = endSubscription(sub(), "2026-02-28", NOW);
    expect(ended.endDate).toBe("2026-02-28");
    expect(run([ended], "2026-06-01").map((e) => e.billingMonth)).toEqual(["2026-01", "2026-02"]);
  });
});

describe("subscription edits", () => {
  it("rejects invalid price / date", () => {
    expect(() => changeSubscriptionPrice(sub(), 0, NOW)).toThrow(RangeError);
    expect(() => changeSubscriptionPrice(sub(), 1.5, NOW)).toThrow(RangeError);
    expect(() => endSubscription(sub(), "2026-13-01", NOW)).toThrow(RangeError);
  });
});

describe("nextChargeDate", () => {
  it("is the next billing day after today (today's charge is already owed)", () => {
    expect(nextChargeDate(sub(), "2026-03-10")).toBe("2026-03-15");
    expect(nextChargeDate(sub(), "2026-03-15")).toBe("2026-04-15");
    expect(nextChargeDate(sub(), "2026-12-20")).toBe("2027-01-15");
  });
  it("clamps to month end", () => {
    expect(nextChargeDate(sub({ billingDay: 31 }), "2026-01-31")).toBe("2026-02-28");
  });
  it("waits for a future start date", () => {
    expect(nextChargeDate(sub({ startDate: "2027-02-20" }), "2026-11-01")).toBe("2027-03-15");
  });
  it("is null once ended", () => {
    expect(nextChargeDate(sub({ endDate: "2026-03-20" }), "2026-03-16")).toBeNull();
    expect(nextChargeDate(sub({ endDate: "2026-04-15" }), "2026-03-16")).toBe("2026-04-15");
  });
});

describe("monthlyTotalsByCurrency", () => {
  it("sums active subscriptions per original currency", () => {
    const subs = [
      sub({ amountMinor: 1000 }),
      sub({ id: "b", amountMinor: 500 }),
      sub({ id: "c", currency: "VND", amountMinor: 99000 }),
      sub({ id: "d", amountMinor: 7777, endDate: "2026-01-01" }),
    ];
    expect(monthlyTotalsByCurrency(subs, "2026-03-01")).toEqual([
      { currency: "USD", amountMinor: 1500 },
      { currency: "VND", amountMinor: 99000 },
    ]);
    expect(monthlyTotalsByCurrency([], "2026-03-01")).toEqual([]);

describe("validateSubscription", () => {
  const ctx = {
    categories: [
      { id: "c", archivedAt: null },
      { id: "ca", archivedAt: "x" },
    ],
    paymentMethods: [
      { id: "p", archivedAt: null },
      { id: "pa", archivedAt: "x" },
    ],
  };
  const good = {
    name: " Netflix ",
    amountMinor: 1599,
    currency: "USD",
    categoryId: "c",
    paymentMethodId: "p",
    billingDay: 15,
    startDate: "2026-01-10",
  };
  const codes = (r: ReturnType<typeof validateSubscription>) => (r.ok ? [] : r.errors.map((e) => e.code));

  it("accepts and trims", () => {
    const r = validateSubscription(good, ctx);
    expect(r.ok && r.value.name).toBe("Netflix");
  });
  it("reports all errors", () => {
    expect(
      codes(
        validateSubscription(
          {
            ...good,
            name: " ",
            amountMinor: 0,
            currency: "EUR",
            categoryId: "x",
            paymentMethodId: "x",
            billingDay: 32,
            startDate: "nope",
          },
          ctx,
        ),
      ),
    ).toEqual([
      "empty-name",
      "invalid-amount",
      "unknown-currency",
      "unknown-category",
      "unknown-payment-method",
      "invalid-billing-day",
      "invalid-start-date",
    ]);
  });
  it("rejects archived category / payment method and bad billing day", () => {
    expect(codes(validateSubscription({ ...good, categoryId: "ca", paymentMethodId: "pa" }, ctx))).toEqual([
      "archived-category",
      "archived-payment-method",
    ]);
    expect(codes(validateSubscription({ ...good, billingDay: 0 }, ctx))).toEqual(["invalid-billing-day"]);
    expect(codes(validateSubscription({ ...good, billingDay: 1.5 }, ctx))).toEqual(["invalid-billing-day"]);
  });
});
