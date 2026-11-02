import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AllowanceLine } from "./allowance-line";
import { SpendingAlert } from "./spending-alert";
import { spendingAlertFromQuery, spendingAlertParams } from "./spending-alert";

describe("spending alert presentation", () => {
  it("announces a warning politely with worried Penny and complete text", () => {
    const html = renderToStaticMarkup(
      <SpendingAlert
        alert={{ kind: "warning", percent: 86, spentMinor: 43_000, limitMinor: 50_000, currency: "USD" }}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Heads up: you&#x27;re at");
    expect(html).toContain("86 %");
    expect(html).toContain("$430.00");
    expect(html).toContain("$500.00");
    expect(html).toContain("(<span");
    expect(html).not.toContain("( <span");
    expect(html).toContain("M54 91q6-7 12 0");
  });

  it("announces an over-limit crossing assertively with dizzy Penny", () => {
    const html = renderToStaticMarkup(
      <SpendingAlert alert={{ kind: "over", overMinor: 2_000, currency: "USD" }} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("gone over your living limit by");
    expect(html).toContain("$20.00");
    expect(html).toContain("m38 54 10 10");
  });
});

describe("spending alert confirmation data", () => {
  it("serializes a service warning and parses it back", () => {
    const params = spendingAlertParams(
      {
        expense: {} as never,
        crossing: "warning",
        status: { month: "2026-11", status: "warning", ratio: 0.86, spentMinor: 43_000, limitMinor: 50_000 },
        allowance: { leftMinor: 7_000, daysLeft: 10, perDayMinor: 700 },
      },
      "USD",
    );
    expect(spendingAlertFromQuery(Object.fromEntries(params))).toEqual({
      kind: "warning",
      percent: 86,
      spentMinor: 43_000,
      limitMinor: 50_000,
      currency: "USD",
    });
  });

  it("serializes an over crossing from the service allowance", () => {
    const params = spendingAlertParams(
      {
        expense: {} as never,
        crossing: "over",
        status: { month: "2026-11", status: "over", ratio: 1.04, spentMinor: 52_000, limitMinor: 50_000 },
        allowance: { leftMinor: -2_000, daysLeft: 10, perDayMinor: 0 },
      },
      "USD",
    );
    expect(spendingAlertFromQuery(Object.fromEntries(params))).toEqual({
      kind: "over",
      overMinor: 2_000,
      currency: "USD",
    });
  });

  it("emits and accepts no alert for no crossing or malformed query data", () => {
    expect(
      spendingAlertParams({ expense: {} as never, crossing: null, status: null, allowance: null }, "USD")
        .size,
    ).toBe(0);
    expect(spendingAlertFromQuery({ crossing: "over", over: "-20", currency: "USD" })).toBeNull();
    expect(spendingAlertFromQuery({ crossing: "warning", percent: "86", currency: "EUR" })).toBeNull();
  });
});

describe("remaining allowance presentation", () => {
  it("shows left-to-spend and the domain-supplied daily allowance", () => {
    const html = renderToStaticMarkup(
      <AllowanceLine allowance={{ leftMinor: 7_200, perDayMinor: 1_200, daysLeft: 6 }} currency="USD" />,
    );
    expect(html).toContain("$72.00");
    expect(html).toContain("$12.00");
    expect(html).toContain("for 6 days");
  });

  it("shows an over amount without a daily allowance", () => {
    const html = renderToStaticMarkup(
      <AllowanceLine allowance={{ leftMinor: -2_000, perDayMinor: 0, daysLeft: 6 }} currency="USD" />,
    );
    expect(html).toContain("$20.00");
    expect(html).toContain("over");
    expect(html).not.toContain("/day");
  });
});
