import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  baseUrl,
  choose,
  launchBrowser,
  newPage,
  queryDb,
  trackBadResponses,
  trackErrors,
  writeDb,
} from "./support";

// Runs last: these cases reshape the throw-away database to make every crossing deterministic.
let browser: Browser;
let categoryId: string;
let paymentMethodId: string;

const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
  today.getDate(),
).padStart(2, "0")}`;
const month = date.slice(0, 7);

beforeAll(async () => {
  browser = await launchBrowser();
  writeDb(
    `insert or ignore into category
       (id, name, kind, counts_toward_living_limit, default_bottle_id, color, mascot, archived_at)
     values ('e2e-alert-category', 'e2e Living alerts', 'daily', 1, null, '#D88C72', 'penny', null)`,
  );
  writeDb(`update category set counts_toward_living_limit = (id = 'e2e-alert-category')`);
  categoryId = queryDb<{ id: string }>(`select id from category where id = 'e2e-alert-category'`)[0]!.id;
  paymentMethodId = queryDb<{ id: string }>(
    `select id from payment_method where archived_at is null order by name limit 1`,
  )[0]!.id;
});

afterAll(async () => {
  await browser.close();
});

async function withPage(fn: (page: Page) => Promise<void>) {
  const { context, page } = await newPage(browser);
  const errors = trackErrors(page);
  const bad = trackBadResponses(page);
  try {
    await fn(page);
    expect(errors, "console errors").toEqual([]);
    expect(bad, "failed requests").toEqual([]);
  } finally {
    await context.close();
  }
}

function arrange(spentMinor: number, warningPercent = 80) {
  writeDb(`delete from expense where note like 'e2e alert %'`);
  writeDb(`delete from living_limit`);
  writeDb(`insert into living_limit (month, limit_minor) values (?, 10000)`, month);
  writeDb(`update settings set limit_warning_percent = ? where id = 1`, warningPercent);
  if (spentMinor > 0) {
    const timestamp = `${date}T12:00:00.000Z`;
    writeDb(
      `insert into expense
         (id, date, amount_minor, currency, fx_rate_to_base, category_id, payment_method_id,
          bottle_id, note, source, subscription_id, billing_month, created_at, updated_at)
       values ('e2e-alert-baseline', ?, ?, 'USD', null, ?, ?, null, 'e2e alert baseline',
               'manual', null, null, ?, ?)`,
      date,
      spentMinor,
      categoryId,
      paymentMethodId,
      timestamp,
      timestamp,
    );
  }
}

async function addExpense(page: Page, amount: string, note: string) {
  await page.goto(`${baseUrl()}/quick-add`);
  await page.getByLabel("Amount").fill(amount);
  await choose(page, "Category", "e2e Living alerts");
  await page.getByLabel("Payment method").selectOption(paymentMethodId);
  await page.getByLabel("Note (optional)").fill(note);
  await page.getByRole("button", { name: "Save expense" }).click();
  await page.waitForURL(/\/transactions\?saved=added/);
}

describe("in-app spending alerts", () => {
  it("shows the quick-add allowance but keeps the normal confirmation below the warning level", async () => {
    arrange(7_900);
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/quick-add`);
      await expect.poll(() => page.locator(".quick-allowance").innerText()).toContain("$21.00 left");
      await addExpense(page, "0.50", "e2e alert below");
      expect(await page.locator(".spending-alert").count()).toBe(0);
      expect(await page.getByRole("status").innerText()).toContain("Transaction saved");
    });
  });

  it("announces a warning crossing with worried Penny and the new total", async () => {
    arrange(7_900);
    await withPage(async (page) => {
      await addExpense(page, "2.00", "e2e alert warning");
      const alert = page.locator(".spending-alert-warning");
      expect(await alert.getAttribute("role")).toBe("status");
      expect(await alert.innerText()).toContain("81 % of your living limit");
      expect(await alert.innerText()).toContain("$81.00 of $100.00");
      expect(await alert.locator("path[d^='m36 48']").count()).toBeGreaterThan(0);
    });
  });

  it("announces an over crossing with dizzy Penny", async () => {
    arrange(9_900);
    await withPage(async (page) => {
      await addExpense(page, "2.00", "e2e alert over");
      const alert = page.locator(".spending-alert-over");
      expect(await alert.getAttribute("role")).toBe("alert");
      expect(await alert.innerText()).toContain("gone over your living limit by $1.00");
      expect(await alert.locator("path[d^='m38 54']").count()).toBeGreaterThan(0);
    });
  });

  it("does not repeat an alert when spending was already over", async () => {
    arrange(10_100);
    await withPage(async (page) => {
      await addExpense(page, "1.00", "e2e alert already over");
      expect(await page.locator(".spending-alert").count()).toBe(0);
      expect(await page.getByRole("status").innerText()).toContain("Transaction saved");
    });
  });

  it("validates the setting and changing it moves the dashboard status", async () => {
    arrange(8_100, 90);
    await withPage(async (page) => {
      await page.goto(baseUrl());
      expect(await page.getByRole("heading", { name: "Comfortably within your limit" }).count()).toBe(1);
      expect(await page.locator(".allowance-line").innerText()).toContain("$19.00 left");

      await page.goto(`${baseUrl()}/settings#living-limit`);
      const input = page.getByLabel("Warning level (%)");
      await input.fill("49");
      await input.evaluate((element) => {
        (element as HTMLInputElement).form!.noValidate = true;
      });
      await page.getByRole("button", { name: "Save warning level" }).click();
      await expect
        .poll(() =>
          page.locator("small", { hasText: "Warning level must be a whole number from 50 to 99." }).count(),
        )
        .toBe(1);

      await input.fill("80");
      await page.getByRole("button", { name: "Save warning level" }).click();
      await expect.poll(() => page.getByRole("status").filter({ hasText: "Saved." }).count()).toBe(1);
      await page.goto(baseUrl());
      expect(await page.getByRole("heading", { name: "Getting close" }).count()).toBe(1);
      expect(await page.getByText("You’ve reached your 80% warning level.").count()).toBe(1);
    });
  });
});
