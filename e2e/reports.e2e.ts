import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MOBILE,
  baseUrl,
  basicA11y,
  hasHorizontalOverflow,
  launchBrowser,
  newPage,
  trackErrors,
} from "./support";

// Runs after flows.e2e.ts (file order), so the shared temp DB already has expenses and income.
let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
});

async function withPage<T>(fn: (page: Page, errors: string[]) => Promise<T>, viewport?: typeof MOBILE) {
  const { context, page } = await newPage(browser, viewport);
  const errors = trackErrors(page);
  try {
    return await fn(page, errors);
  } finally {
    await context.close();
  }
}

describe("Dashboard", () => {
  it("shows status, spend, categories, bottles and no console errors", async () => {
    await withPage(async (page, errors) => {
      await page.goto(`${baseUrl()}/`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      expect(await page.getByRole("heading", { name: "Spend by category" }).isVisible()).toBe(true);
      expect(await page.getByRole("heading", { name: "Bottle balances" }).isVisible()).toBe(true);
      expect(await page.getByRole("heading", { name: "Upcoming subscriptions" }).isVisible()).toBe(true);
      expect(await page.getByTestId("month-spend").innerText()).toMatch(/\$|₫/);
      expect(await basicA11y(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  });

  it("does not overflow on a phone", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }, MOBILE);
  });
});

describe("Reports", () => {
  it("renders four charts with table fallbacks and switches granularity", async () => {
    await withPage(async (page, errors) => {
      await page.goto(`${baseUrl()}/reports`);
      await page.getByRole("heading", { name: "Reports", level: 1 }).waitFor();
      await page.locator(".recharts-surface").first().waitFor();
      expect(await page.locator(".chart-card").count()).toBe(4);
      expect(await page.getByText("View as table").count()).toBe(4);
      for (const label of ["Week", "Year", "Month"]) {
        await page.getByRole("navigation", { name: "Compare by" }).getByRole("link", { name: label }).click();
        await page.waitForURL(new RegExp(`g=${label.toLowerCase()}`));
        await page.locator(".recharts-surface").first().waitFor();
        expect(
          await page
            .getByRole("navigation", { name: "Compare by" })
            .getByRole("link", { name: label })
            .getAttribute("aria-current"),
        ).toBe("page");
      }
      expect(await basicA11y(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  });

  it("shows the monthly summary and exports CSV", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/reports`);
      expect(await page.getByTestId("report-total").isVisible()).toBe(true);
      await page.getByRole("button", { name: "Export CSV" }).click();
      await page.getByText(/Export saved to/).waitFor();
    });
  });

  it("does not overflow on a phone", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/reports`);
      await page.locator(".recharts-surface").first().waitFor();
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }, MOBILE);
  });
});
