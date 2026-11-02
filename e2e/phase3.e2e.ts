import { existsSync, readFileSync } from "node:fs";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MOBILE,
  baseUrl,
  basicA11y,
  choose,
  hasHorizontalOverflow,
  launchBrowser,
  newPage,
  queryDb,
  tabAudit,
  trackBadResponses,
  trackErrors,
} from "./support";

// Runs after flows.e2e.ts on the same throw-away database (files run alphabetically, serially).
let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
});

async function withPage<T>(fn: (page: Page) => Promise<T>, viewport?: typeof MOBILE): Promise<T> {
  const { context, page } = await newPage(browser, viewport);
  const errors = trackErrors(page);
  const bad = trackBadResponses(page);
  try {
    const result = await fn(page);
    expect(errors, "console errors").toEqual([]);
    expect(bad, "failed requests").toEqual([]);
    return result;
  } finally {
    await context.close();
  }
}

const statusText = (page: Page, containing: string) =>
  page.locator("[role=status]", { hasText: containing }).first().innerText();

describe("PWA and favicon (#52)", () => {
  it("serves a valid manifest, icons and service worker, and links them from the page", async () => {
    const manifest = await (await fetch(`${baseUrl()}/manifest.webmanifest`)).json();
    expect(manifest).toMatchObject({ name: "Cozy Coins", display: "standalone", start_url: "/" });
    for (const icon of manifest.icons) {
      const res = await fetch(`${baseUrl()}${icon.src}`);
      expect(res.status, icon.src).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
    }
    const sw = await fetch(`${baseUrl()}/sw.js`);
    expect(sw.status).toBe(200);
    expect(await sw.text()).toContain("notificationclick");
    expect((await fetch(`${baseUrl()}/icon.svg`)).status).toBe(200);
    await withPage(async (page) => {
      await page.goto(baseUrl());
      expect(await page.locator("link[rel=manifest]").getAttribute("href")).toBe("/manifest.webmanifest");
      await expect
        .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())))
        .toBe(true);
    });
  });
});

describe("Income & Bottles", () => {
  it("shows balances per bottle and allocation detail per income", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/bottles`);
      await expect.poll(() => page.locator(".bottle-card").count()).toBe(6);
      const play = page.locator(".bottle-card", { hasText: "Play" });
      expect(await play.innerText()).toContain("$100.00"); // 10% of the $1,000.00 e2e salary
      const salary = page.locator("details.income-detail", { hasText: "e2e Salary" });
      await salary.locator("summary").first().click();
      const list = salary.getByRole("list", { name: /Allocation of e2e Salary/ });
      expect(await list.innerText()).toContain("$500.00");
      expect(await list.locator("li").count()).toBe(6);
    });
  });

  it("transfers between bottles and lists the transfer", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/bottles`);
      const form = page.locator("form", { has: page.getByRole("button", { name: "Transfer", exact: true }) });
      await form.getByLabel("From").selectOption({ label: "Give" });
      await form.getByLabel("To").selectOption({ label: "Play" });
      await form.getByLabel(/Amount/).fill("10.00");
      await form.getByRole("button", { name: "Transfer", exact: true }).click();
      await expect.poll(() => statusText(page, "Saved")).toContain("Saved");
      await page.reload();
      expect(await page.locator(".bottle-card", { hasText: "Give" }).innerText()).toContain("$90.00");
      expect(await page.locator(".bottle-card", { hasText: "Play" }).innerText()).toContain("$110.00");
      expect(await page.getByRole("list", { name: "Bottle transfers" }).innerText()).toContain("Give → Play");
    });
    expect(queryDb<{ amount_minor: number }>(`select amount_minor from bottle_transfer`)).toEqual([
      { amount_minor: 1000 },
    ]);
  });

  it("rejects a transfer of more than zero to the same bottle with a clear message", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/bottles`);
      const form = page.locator("form", { has: page.getByRole("button", { name: "Transfer", exact: true }) });
      await form.getByLabel("From").selectOption({ label: "Play" });
      await form.getByLabel("To").selectOption({ label: "Play" });
      await form.getByLabel(/Amount/).fill("5.00");
      await form.getByRole("button", { name: "Transfer", exact: true }).click();
      await expect.poll(() => page.locator("[role=alert]").count()).toBeGreaterThan(0);
    });
    expect(queryDb(`select 1 from bottle_transfer`).length).toBe(1);
  });
});

describe("Pay-day banner", () => {
  it("appears for a due pay day and is resolved by Add income (explicit payDaySlot kept)", async () => {
    // Reminders count from the first-use date (today), so make today a pay day (in the app's time zone).
    const day = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", day: "numeric" }).format(
        new Date(),
      ),
    );
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings`);
      const form = page.locator("form", { has: page.getByLabel("Pay days of the month") });
      await form.getByLabel("Pay days of the month").fill(String(day));
      await form.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => statusText(page, "Saved")).toContain("Saved");
    });
    await withPage(async (page) => {
      await page.goto(baseUrl());
      const banner = page.getByRole("region", { name: "Pay day check-in" });
      await expect.poll(() => banner.count(), { timeout: 10_000 }).toBe(1);
      expect(await banner.getByRole("listitem").count()).toBe(1);
      const link = banner.getByRole("link", { name: /Add income/ });
      const slot = new URL(`http://x${await link.getAttribute("href")}`).searchParams.get("payDaySlot");
      expect(slot).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      await link.click();
      await page.waitForURL(/payDaySlot=/);
      await page.getByLabel("Amount").fill("500.00");
      await page.getByLabel("Income source").fill("e2e Second pay");
      await page.getByRole("button", { name: "Save income" }).click();
      await page.waitForURL(/saved=added/);
      await expect.poll(() => banner.count(), { timeout: 10_000 }).toBe(0);

      const [income] = queryDb<{ pay_day_slot: string }>(
        `select pay_day_slot from income where source = 'e2e Second pay'`,
      );
      expect(income?.pay_day_slot).toBe(slot);
      const states = queryDb<{ slot: string; status: string }>(`select slot, status from reminder`);
      expect(states.find((s) => s.slot === slot)?.status).toBe("done");
    });
  });

  it("only asks for notification permission when the button is clicked", async () => {
    const { context, page } = await newPage(browser);
    await page.goto(baseUrl());
    const asked = await page.evaluate(() => Notification.permission);
    expect(asked).toBe("default"); // nothing prompted on load
    await context.close();
  });
});

describe("Settings", () => {
  it("edits bottle ratios with a live percentage and saves a new rule version", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings`);
      const necessities = page.getByLabel("Necessities", { exact: true }).first();
      expect(await necessities.inputValue()).toBe("5");
      await necessities.fill("10");
      expect(
        await page
          .locator(
            "output[for='ratio-" + (await necessities.getAttribute("id"))?.replace("ratio-", "") + "']",
          )
          .innerText(),
      ).toBe("66.7%");
      await page.getByRole("button", { name: "Save bottle ratios" }).click();
      await expect.poll(() => statusText(page, "Saved")).toContain("Saved");
    });
    const versions = queryDb<{ n: number }>(`select count(*) as n from bottle_rule_version`)[0]!.n;
    expect(versions).toBe(2);
    const income = queryDb<{ v: string }>(
      `select bottle_rule_version_id as v from income where source = 'e2e Salary'`,
    )[0]!;
    expect(income.v).toMatch(/^0000/); // the old income keeps its original rule
  });

  it("adds a category that then appears in Quick add", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings`);
      await page.getByText("Add a category", { exact: true }).click();
      const form = page.locator("form", { has: page.getByRole("button", { name: "Add category" }) });
      await form.getByLabel("Name").fill("e2e Pets");
      await form.getByRole("button", { name: "Add category" }).click();
      await expect.poll(() => statusText(page, "Saved")).toContain("Saved");
      await page.goto(`${baseUrl()}/quick-add`);
      await choose(page, "Category", "e2e Pets");
    });
  });

  it("saves an exchange rate and a living limit (with the suggestion pre-filled)", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings`);
      const rate = page.locator("form", { has: page.getByRole("button", { name: "Save rate" }) });
      await rate.getByLabel(/1 unit equals/).fill("0.00004");
      await rate.getByRole("button", { name: "Save rate" }).click();
      await expect.poll(() => statusText(page, "Saved")).toContain("Saved");
      await page.reload();
      expect(await page.getByRole("list", { name: "Saved exchange rates" }).innerText()).toContain("0.00004");

      const limit = page.locator("form", { has: page.getByRole("button", { name: "Save limit" }) });
      expect(await limit.getByLabel(/Limit/).inputValue()).toMatch(/^\d+\.\d{2}$/);
      await limit.getByLabel(/Limit/).fill("750.00");
      await limit.getByRole("button", { name: "Save limit" }).click();
      await expect.poll(() => statusText(page, "Saved")).toContain("Saved");
      await page.reload();
      expect(await page.locator("#living-limit").innerText()).toContain("$750.00");
    });
  });
});

describe("Backup, export and restore", () => {
  it("exports CSV files", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings#data`);
      await page.getByRole("button", { name: "Export CSV" }).click();
      const text = await statusText(page, "CSV files saved in");
      const dir = /saved in (.+?) \(/.exec(text)?.[1];
      expect(dir && existsSync(`${dir}/expenses.csv`)).toBeTruthy();
      expect(readFileSync(`${dir}/expenses.csv`, "utf8")).toContain("id,date,amount,currency");
      expect(readFileSync(`${dir}/incomes.csv`, "utf8")).toContain("e2e Salary");
    });
  });

  it("round-trips: back up, change data, restore with the explicit checkbox, data is back", async () => {
    let backupPath = "";
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings#data`);
      await page.getByRole("button", { name: "Create a backup" }).click();
      backupPath = /Backup saved to (.+)$/.exec(await statusText(page, "Backup saved to"))![1]!.trim();
      expect(existsSync(backupPath)).toBe(true);
    });

    // Change something after the backup.
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings`);
      await page.getByText("Add a payment method", { exact: true }).click();
      const form = page.locator("form", { has: page.getByRole("button", { name: "Add payment method" }) });
      await form.getByLabel("Name").fill("e2e Temp card");
      await form.getByRole("button", { name: "Add payment method" }).click();
      await expect.poll(() => statusText(page, "Saved")).toContain("Saved");
    });
    expect(queryDb(`select 1 from payment_method where name = 'e2e Temp card'`).length).toBe(1);

    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings#data`);
      await page.setInputFiles("#backup-file", backupPath);
      // The replace checkbox is required: submitting without it is blocked by the browser.
      await page.getByRole("button", { name: "Restore backup" }).click();
      expect(await page.getByText(/^Restored\./).count()).toBe(0);
      await page.getByLabel("Yes, replace my current data with this backup").check();
      await page.getByRole("button", { name: "Restore backup" }).click();
      const done = await statusText(page, "Restored.");
      const safety = /first at (.+)$/.exec(done)?.[1]?.trim();
      expect(safety && existsSync(safety), "safety backup written").toBeTruthy();
    });
    expect(queryDb(`select 1 from payment_method where name = 'e2e Temp card'`)).toEqual([]);
    expect(queryDb(`select 1 from income where source = 'e2e Salary'`).length).toBe(1);

    // The app keeps working on the restored database.
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/transactions?all=1`);
      expect(await page.locator("li.transaction-row", { hasText: "e2e Salary" }).count()).toBe(1);
    });
  });

  it("rejects a file that is not a backup and keeps current data", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings#data`);
      await page.setInputFiles("#backup-file", {
        name: "bad.db",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("not a database"),
      });
      await page.getByLabel("Yes, replace my current data with this backup").check();
      await page.getByRole("button", { name: "Restore backup" }).click();
      await expect.poll(() => page.locator(".form-error").innerText()).toContain("isn’t a valid");
    });
    expect(queryDb(`select 1 from income where source = 'e2e Salary'`).length).toBe(1);
  });
});

const ROUTES = ["/bottles", "/settings"];
describe("new screens: layout, a11y, keyboard", () => {
  for (const route of ROUTES) {
    it(`${route} has no overflow at 390px`, async () => {
      await withPage(async (page) => {
        await page.goto(`${baseUrl()}${route}`);
        expect(await hasHorizontalOverflow(page)).toBe(false);
      }, MOBILE);
    });
    it(`${route} passes basic a11y`, async () => {
      await withPage(async (page) => {
        await page.goto(`${baseUrl()}${route}`);
        expect(await basicA11y(page)).toEqual([]);
      });
    });
    it(`${route} is keyboard navigable with visible focus`, async () => {
      await withPage(async (page) => {
        await page.goto(`${baseUrl()}${route}`);
        const stops = await tabAudit(page, 60);
        expect(stops.length).toBeGreaterThan(5);
        expect(stops.filter((s) => !s.focusVisible).map((s) => s.label)).toEqual([]);
      });
    });
  }
  it("the home page with the pay-day banner passes a11y and has no overflow on mobile", async () => {
    await withPage(async (page) => {
      await page.goto(baseUrl());
      expect(await basicA11y(page)).toEqual([]);
    });
    await withPage(async (page) => {
      await page.goto(baseUrl());
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }, MOBILE);
  });
});
