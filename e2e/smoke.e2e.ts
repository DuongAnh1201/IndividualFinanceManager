import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MOBILE,
  baseUrl,
  basicA11y,
  hasHorizontalOverflow,
  launchBrowser,
  newPage,
  tabAudit,
  trackErrors,
} from "./support";

let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
});

describe("harness smoke", () => {
  it("serves the home page without page errors", async () => {
    const { context, page } = await newPage(browser);
    const errors = trackErrors(page);
    const res = await page.goto(baseUrl());
    expect(res?.status()).toBe(200);
    expect(await page.title()).not.toBe("");
    expect(errors).toEqual([]);
    await context.close();
  });

  it("unknown routes show the friendly not-found page", async () => {
    const { context, page } = await newPage(browser);
    const res = await page.goto(`${baseUrl()}/definitely-not-a-page`);
    expect(res?.status()).toBe(404);
    await context.close();
  });

  it("home page has no horizontal overflow at 390px", async () => {
    const { context, page } = await newPage(browser, MOBILE);
    await page.goto(baseUrl());
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await context.close();
  });

  it("home page passes the basic a11y checks", async () => {
    const { context, page } = await newPage(browser);
    await page.goto(baseUrl());
    expect(await basicA11y(page)).toEqual([]);
    await context.close();
  });

  it("is keyboard navigable with a visible focus ring", async () => {
    const { context, page } = await newPage(browser);
    await page.goto(baseUrl());
    const stops = await tabAudit(page);
    expect(stops.length).toBeGreaterThan(0);
    // Every stop must show a focus indication; the message lists the offenders.
    expect(stops.filter((s) => !s.focusVisible).map((s) => s.label)).toEqual([]);
    await context.close();
  });
});
