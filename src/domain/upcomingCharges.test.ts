import { describe, expect, it } from "vitest";
import { upcomingCharges } from "./upcomingCharges";
import type { Subscription } from "./types";

const sub = (id: string, o: Partial<Subscription> = {}): Subscription => ({
  id,
  name: id,
  amountMinor: 1000,
  currency: "USD",
  categoryId: "c",
  paymentMethodId: "p",
  billingDay: 15,
  startDate: "2026-01-01",
  endDate: null,
  createdAt: "",
  updatedAt: "",
  ...o,
});

describe("upcomingCharges", () => {
  it("lists charges in the next 30 days, soonest first", () => {
    const r = upcomingCharges([sub("b", { billingDay: 20 }), sub("a", { billingDay: 5 })], "2026-11-01");
    expect(r).toEqual([
      { subscriptionId: "a", billingMonth: "2026-11", chargeDate: "2026-11-05" },
      { subscriptionId: "b", billingMonth: "2026-11", chargeDate: "2026-11-20" },
    ]);
  });
  it("excludes today's charge and includes the last day of the window", () => {
    expect(upcomingCharges([sub("a", { billingDay: 1 })], "2026-11-01").map((c) => c.chargeDate)).toEqual([
      "2026-12-01",
    ]);
    expect(upcomingCharges([sub("a", { billingDay: 1 })], "2026-11-01", 30).map((c) => c.chargeDate)).toEqual(
      ["2026-12-01"],
    );
    expect(upcomingCharges([sub("a", { billingDay: 1 })], "2026-11-01", 29)).toEqual([]);
  });
  it("clamps billing day to month end", () => {
    const r = upcomingCharges([sub("a", { billingDay: 31 })], "2027-02-10", 30);
    expect(r.map((c) => c.chargeDate)).toEqual(["2027-02-28"]);
  });
  it("can return a subscription twice in a long window", () => {
    const r = upcomingCharges([sub("a", { billingDay: 31 })], "2027-01-15", 60);
    expect(r.map((c) => c.chargeDate)).toEqual(["2027-01-31", "2027-02-28"]);
  });
  it("respects start and end dates", () => {
    const future = sub("f", { startDate: "2026-11-20", billingDay: 10 });
    expect(upcomingCharges([future], "2026-11-01", 60).map((c) => c.chargeDate)).toEqual(["2026-12-10"]);
    const ending = sub("e", { billingDay: 10, endDate: "2026-11-30" });
    expect(upcomingCharges([ending], "2026-11-01", 60).map((c) => c.chargeDate)).toEqual(["2026-11-10"]);
    const ended = sub("x", { billingDay: 10, endDate: "2026-10-31" });
    expect(upcomingCharges([ended], "2026-11-01", 60)).toEqual([]);
  });
  it("empty input and invalid days", () => {
    expect(upcomingCharges([], "2026-11-01")).toEqual([]);
    expect(() => upcomingCharges([], "2026-11-01", 0)).toThrow();
  });
});
