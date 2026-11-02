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

// One shared throw-away database: the tests below build on each other and run in order.
let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
});

const today = new Date();
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthSlot = `${ymd(today).slice(0, 8)}10`;
const twoMonthsAgo = ymd(new Date(today.getFullYear(), today.getMonth() - 2, 1));

async function withPage<T>(
  fn: (page: Page, errors: string[]) => Promise<T>,
  viewport?: typeof MOBILE,
): Promise<T> {
  const { context, page } = await newPage(browser, viewport);
  const errors = trackErrors(page);
  const bad = trackBadResponses(page);
  try {
    const result = await fn(page, errors);
    expect(bad, "requests that failed").toEqual([]);
    return result;
  } finally {
    await context.close();
  }
}

describe("Quick add: expense", () => {
  it("saves an expense, lands on Transactions with a confirmation, and defaults the bottle", async () => {
    await withPage(async (page, errors) => {
      await page.goto(`${baseUrl()}/quick-add`);
      await page.getByLabel("Amount").fill("12.50");
      // Category and Payment method start empty and are required.
      await choose(page, "Category", "Groceries/Daily");
      await choose(page, "Payment method", "Debit card");
      await page.getByLabel("Note (optional)").fill("e2e coffee");
      await page.getByRole("button", { name: "Save expense" }).click();

      await page.waitForURL(/\/transactions\?saved=added/);
      await expect.poll(() => page.getByRole("status").innerText()).toContain("Transaction saved");
      const row = page.locator("li.transaction-row", { hasText: "e2e coffee" });
      await expect.poll(() => row.count()).toBe(1);
      expect(await row.innerText()).toContain("12.50");
      expect(errors).toEqual([]);
    });
    const [saved] = queryDb<{ amount_minor: number; currency: string; bottle_name: string }>(
      `select e.amount_minor, e.currency, b.name as bottle_name
         from expense e left join bottle b on b.id = e.bottle_id where e.note = 'e2e coffee'`,
    );
    expect(saved).toEqual({ amount_minor: 1250, currency: "USD", bottle_name: "Necessities" });
  });

  it("explains a rejected entry, keeps what was typed, and saves nothing", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/quick-add`);
      await page.getByLabel("Amount").fill("0");
      await choose(page, "Category", "Groceries/Daily");
      await choose(page, "Payment method", "Cash");
      await page.getByLabel("Note (optional)").fill("e2e rejected");
      await page.getByRole("button", { name: "Save expense" }).click();
      await expect.poll(() => page.locator("[role=alert], .field-error").count()).toBeGreaterThan(0);
      expect(page.url()).toContain("/quick-add");
      expect(await page.getByLabel("Note (optional)").inputValue()).toBe("e2e rejected");
    });
    expect(queryDb(`select 1 from expense where note = 'e2e rejected'`)).toEqual([]);
  });

  it("saves a VND expense with an explicit rate as whole đồng", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/quick-add`);
      await choose(page, "Currency", "VND");
      await page.getByLabel("Amount").fill("50000");
      await page.getByLabel(/Exchange rate to USD/).fill("0.00004");
      await choose(page, "Category", "Transport");
      await choose(page, "Payment method", "Cash");
      await page.getByLabel("Note (optional)").fill("e2e vnd");
      await page.getByRole("button", { name: "Save expense" }).click();
      await page.waitForURL(/saved=added/);
    });
    const [row] = queryDb<{ amount_minor: number; currency: string; fx_rate_to_base: number }>(
      `select amount_minor, currency, fx_rate_to_base from expense where note = 'e2e vnd'`,
    );
    expect(row).toEqual({ amount_minor: 50000, currency: "VND", fx_rate_to_base: 0.00004 });
  });
});

describe("Quick add: income from a pay-day reminder", () => {
  it("shows which reminder it resolves, splits 5:1:1:1:1:1 and marks the slot done", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/quick-add?kind=income&payDaySlot=${monthSlot}`);
      await expect.poll(() => page.locator(".inline-notice").innerText()).toContain(monthSlot);
      await page.getByLabel("Amount").fill("1000.00");
      await page.getByLabel("Income source").fill("e2e Salary");
      await page.getByRole("button", { name: "Save income" }).click();
      await page.waitForURL(/saved=added/);
      const row = page.locator("li.transaction-row", { hasText: "e2e Salary" });
      await expect.poll(() => row.count()).toBe(1);
      expect(await row.innerText()).toContain("1,000.00");
    });
    const alloc = queryDb<{ name: string; amount_minor: number }>(
      `select b.name, a.amount_minor from bottle_allocation a
         join income i on i.id = a.income_id join bottle b on b.id = a.bottle_id
        where i.source = 'e2e Salary' order by b.sort_order`,
    );
    expect(alloc).toEqual([
      { name: "Necessities", amount_minor: 50_000 },
      { name: "Long-term Savings", amount_minor: 10_000 },
      { name: "Financial Freedom", amount_minor: 10_000 },
      { name: "Education", amount_minor: 10_000 },
      { name: "Play", amount_minor: 10_000 },
      { name: "Give", amount_minor: 10_000 },
    ]);
    const [slot] = queryDb<{ pay_day_slot: string }>(
      `select pay_day_slot from income where source = 'e2e Salary'`,
    );
    expect(slot?.pay_day_slot).toBe(monthSlot);
  });
});

describe("Subscriptions", () => {
  it("creates a subscription, back-posts owed charges, then removes it", async () => {
    await withPage(async (page, errors) => {
      await page.goto(`${baseUrl()}/subscriptions/new`);
      await page.getByLabel("Subscription name").fill("e2e Streamly");
      await page.getByLabel("Monthly amount").fill("9.99");
      await page.getByLabel("Billing day of month").fill("1");
      await page.getByLabel("Start date").fill(twoMonthsAgo);
      await choose(page, "Category", "Subscriptions");
      await choose(page, "Payment method", "Credit card");
      await page.getByRole("button", { name: "Add subscription" }).click();
      await page.waitForURL(/\/subscriptions\?saved=1/);
      await expect.poll(() => page.getByRole("status").innerText()).toContain("Subscription saved");
      const card = page.locator("article, li, section", { hasText: "e2e Streamly" }).last();
      expect(await card.innerText()).toContain("9.99");

      // Remove: two-step confirmation.
      await page.getByRole("button", { name: "Remove subscription" }).click();
      await page.getByRole("button", { name: /Confirm remove subscription/i }).click();
      await page.waitForURL(/\/subscriptions\?saved=ended/);
      await expect.poll(() => page.getByText(/Ended \d{4}-\d{2}-\d{2}/).count()).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
    const charges = queryDb<{ billing_month: string; amount_minor: number }>(
      `select billing_month, amount_minor from expense where source = 'subscription' order by billing_month`,
    );
    expect(charges.length).toBeGreaterThanOrEqual(2);
    expect(new Set(charges.map((c) => c.billing_month)).size).toBe(charges.length); // no duplicates
    expect(charges.every((c) => c.amount_minor === 999)).toBe(true);
    const [sub] = queryDb<{ end_date: string | null }>(
      `select end_date from subscription where name = 'e2e Streamly'`,
    );
    expect(sub?.end_date).not.toBeNull();
  });
});

describe("Transactions filter", () => {
  it("filters by category and type, and shows a friendly empty state", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/quick-add`);
      await page.getByLabel("Amount").fill("30.00");
      await choose(page, "Category", "Dining out");
      await choose(page, "Payment method", "Credit card");
      await page.getByLabel("Note (optional)").fill("e2e dinner");
      await page.getByRole("button", { name: "Save expense" }).click();
      await page.waitForURL(/saved=added/);

      const notes = async () => (await page.locator("li.transaction-row").allInnerTexts()).join("\n");
      expect(await notes()).toContain("e2e dinner");
      expect(await notes()).toContain("e2e coffee");

      await choose(page, "select[name=categoryId]", "Dining out");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await page.waitForURL(/categoryId=/);
      expect(await notes()).toContain("e2e dinner");
      expect(await notes()).not.toContain("e2e coffee");

      await page.goto(`${baseUrl()}/transactions`);
      await choose(page, "select[name=kind]", "Income");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await page.waitForURL(/kind=income/);
      expect(await notes()).toContain("e2e Salary");
      expect(await notes()).not.toContain("e2e dinner");

      await page.goto(`${baseUrl()}/transactions`);
      await choose(page, "select[name=categoryId]", "Health");
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect.poll(() => page.getByText("No transactions in this view.").count()).toBe(1);

      await page.getByRole("link", { name: "Show all" }).click();
      await page.waitForURL(/all=1/);
      expect(await notes()).toContain("e2e coffee");
    });
  });

  it("edits and deletes an expense", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/transactions`);
      const row = page.locator("li.transaction-row", { hasText: "e2e dinner" });
      await row.getByRole("link", { name: /Edit/ }).click();
      await page.waitForURL(/quick-add.*id=/);
      await page.getByLabel("Amount").fill("31.00");
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.waitForURL(/saved=updated/);
      expect(await page.locator("li.transaction-row", { hasText: "e2e dinner" }).innerText()).toContain(
        "31.00",
      );

      await page
        .locator("li.transaction-row", { hasText: "e2e dinner" })
        .getByRole("button", { name: "Delete" })
        .click();
      await page.getByRole("button", { name: /Confirm delete/i }).click();
      await page.waitForURL(/saved=deleted/);
      expect(await page.locator("li.transaction-row", { hasText: "e2e dinner" }).count()).toBe(0);
    });
    expect(queryDb(`select 1 from expense where note = 'e2e dinner'`)).toEqual([]);
  });
});

const ROUTES = [
  "/",
  "/quick-add",
  "/quick-add?kind=income",
  "/transactions",
  "/subscriptions",
  "/subscriptions/new",
];

describe("clean pages", () => {
  for (const route of ROUTES) {
    it(`${route} loads with no console errors or 4xx/5xx responses`, async () => {
      const { context, page } = await newPage(browser);
      const errors = trackErrors(page);
      const bad: string[] = [];
      page.on("response", (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
      await page.goto(`${baseUrl()}${route}`, { waitUntil: "networkidle" });
      await context.close();
      expect({ errors, bad }).toEqual({ errors: [], bad: [] });
    });
  }
});

describe("mobile layout (390px)", () => {
  for (const route of ROUTES) {
    it(`${route} has no horizontal overflow`, async () => {
      await withPage(async (page) => {
        await page.goto(`${baseUrl()}${route}`);
        expect(await hasHorizontalOverflow(page)).toBe(false);
      }, MOBILE);
    });
  }
});

describe("accessibility and keyboard", () => {
  for (const route of ROUTES) {
    it(`${route} passes the basic a11y checks`, async () => {
      await withPage(async (page) => {
        await page.goto(`${baseUrl()}${route}`);
        expect(await basicA11y(page)).toEqual([]);
      });
    });
    it(`${route} is keyboard navigable with visible focus`, async () => {
      await withPage(async (page) => {
        await page.goto(`${baseUrl()}${route}`);
        const stops = await tabAudit(page);
        expect(stops.length).toBeGreaterThan(2);
        expect(stops.filter((s) => !s.focusVisible).map((s) => s.label)).toEqual([]);
      });
    });
  }

  it("Quick add can be completed with the keyboard", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/quick-add`);
      const order: string[] = [];
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("amount"); // autofocus
      order.push("amount");
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press("Tab");
        const id = await page.evaluate(
          () => document.activeElement?.id || document.activeElement?.textContent?.trim() || "",
        );
        if (order.at(-1) !== id) order.push(id); // the date input has inner month/day/year stops
      }
      expect(order.slice(0, 6)).toEqual([
        "amount",
        "currency",
        "date",
        "categoryId",
        "paymentMethodId",
        "bottleId",
      ]);
      expect(order).toContain("Save expense");
    });
  });
});
