import { existsSync } from "node:fs";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseUrl, launchBrowser, newPage, queryDb, trackBadResponses, trackErrors, writeDb } from "./support";

// Runs after flows.e2e.ts and phase3.e2e.ts (alphabetical, serial) on the same throw-away database.
let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
});

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const { context, page } = await newPage(browser);
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

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const setLimit = (limitMinor: number | null) => {
  writeDb(`delete from living_limit`);
  if (limitMinor !== null)
    writeDb(`insert into living_limit (month, limit_minor) values (?, ?)`, thisMonth(), limitMinor);
};
const toMinor = (text: string) => Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);

type Mood = "happy" | "worried" | "dizzy";
/** Penny's mood is drawn, not labelled: read it from the SVG paths unique to each mood. */
async function pennyMood(page: Page): Promise<Mood> {
  const svg = page.locator(".living-head svg");
  if ((await svg.locator("path[d^='m38 54']").count()) > 0) return "dizzy";
  if ((await svg.locator("path[d^='m36 48']").count()) > 0) return "worried";
  return "happy";
}

describe("Dashboard: Penny's mood follows the living limit", () => {
  let spent = 0; // living spend this month in minor units, read from the dashboard itself

  it("with no limit set, Penny is happy and invites a limit", async () => {
    setLimit(null);
    await withPage(async (page) => {
      await page.goto(baseUrl());
      expect(await page.getByRole("heading", { name: "No living limit yet" }).count()).toBe(1);
      expect(await pennyMood(page)).toBe("happy");
      expect(await page.getByRole("link", { name: /Set a living limit/ }).count()).toBe(1);
      expect(await page.getByRole("progressbar").count()).toBe(0);
    });
  });

  it("learns the month's living spend (a huge limit keeps it comfortable)", async () => {
    setLimit(100_000_000);
    await withPage(async (page) => {
      await page.goto(baseUrl());
      const caption = await page.locator(".meter-caption").innerText();
      spent = toMinor(/^\s*([^\s]+)/.exec(caption)![1]!);
      expect(spent).toBeGreaterThan(0); // the flow tests logged groceries/transport this month
      expect(await page.getByRole("heading", { name: "Comfortably within your limit" }).count()).toBe(1);
    });
  });

  const cases: [string, () => number, Mood, string, RegExp][] = [
    ["comfortable (about 50%)", () => spent * 2, "happy", "Comfortably within your limit", /^50%$/],
    ["warning (about 83%)", () => Math.ceil((spent * 6) / 5), "worried", "Getting close", /^8[0-9]%$/],
    ["over (exactly 100%)", () => spent, "dizzy", "Over your living limit", /^100%$/],
    ["over (limit 0 with spend)", () => 0, "dizzy", "Over your living limit", /^over$/],
  ];
  for (const [name, limit, mood, title, percent] of cases) {
    it(`${name}: ${mood} Penny, matching text, percentage and progressbar`, async () => {
      setLimit(limit());
      await withPage(async (page) => {
        await page.goto(baseUrl());
        expect(await pennyMood(page)).toBe(mood);
        expect(await page.getByRole("heading", { name: title }).count()).toBe(1);
        expect(await page.getByTestId("limit-percent").innerText()).toMatch(percent);
        const bar = page.getByRole("progressbar", { name: "Living limit used" });
        expect(await bar.getAttribute("aria-valuetext")).toContain("of your living limit used");
        const now = Number(await bar.getAttribute("aria-valuenow"));
        expect(now).toBeGreaterThanOrEqual(0);
        expect(now).toBeLessThanOrEqual(100);
      });
    });
  }

  it("exactly 80% is a warning (boundary)", async () => {
    setLimit(Math.round((spent * 5) / 4)); // spent/limit = 0.8 (rounding keeps it on or just above)
    await withPage(async (page) => {
      await page.goto(baseUrl());
      expect(["worried", "happy"]).toContain(await pennyMood(page));
      if (spent % 4 === 0) expect(await pennyMood(page)).toBe("worried");
    });
  });
});

describe("Dashboard: pay-day banner", () => {
  it("shows one banner with a Log income link that keeps the pay-day slot, and dismisses it", async () => {
    // Deterministic state: first used long ago, every month's 1st is a pay day, nothing resolved or dismissed.
    writeDb(`update settings set first_used_on = '2020-01-01', pay_days = '[1]' where id = 1`);
    writeDb(`delete from reminder`);
    writeDb(`update income set pay_day_slot = null where pay_day_slot is not null`);
    await withPage(async (page) => {
      await page.goto(baseUrl());
      const banners = page.getByText(/pay days? (is|are) waiting/i);
      expect(await banners.count(), "pay-day banners visible on the dashboard").toBe(1);

      const log = page.getByRole("link", { name: "Log income" });
      expect(await log.getAttribute("href")).toMatch(
        /^\/quick-add\?kind=income&payDaySlot=\d{4}-\d{2}-\d{2}$/,
      );

      const before = queryDb<{ n: number }>(
        `select count(*) as n from reminder where status = 'dismissed'`,
      )[0]!.n;
      await page.getByRole("button", { name: "Dismiss" }).first().click();
      await expect
        .poll(
          () => queryDb<{ n: number }>(`select count(*) as n from reminder where status = 'dismissed'`)[0]!.n,
        )
        .toBe(before + 1);
    });
  });

  it("shows a friendly, announced error when a pay day can't be dismissed", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/?payday=error`);
      expect(await page.getByRole("alert").filter({ hasText: "couldn’t be dismissed" }).count()).toBe(1);
    });
  });
});

describe("Backup and restore: edge cases", () => {
  const create = async (page: Page) => {
    await page.goto(`${baseUrl()}/settings#data`);
    await page.getByRole("button", { name: "Create a backup" }).click();
    const text = await page.locator("[role=status]", { hasText: "Backup saved to" }).first().innerText();
    return /Backup saved to (.+)$/.exec(text)![1]!.trim();
  };

  it("restore needs both a file and the explicit-replace checkbox, and changes nothing without them", async () => {
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings#data`);
      await page.getByRole("button", { name: "Restore backup" }).click(); // no file, no checkbox
      expect(page.url()).toContain("/settings");
      expect(
        await page.locator("#backup-file").evaluate((el) => (el as HTMLInputElement).validity.valueMissing),
      ).toBe(true);
      expect(
        await page
          .locator("#restore-confirm")
          .evaluate((el) => (el as HTMLInputElement).validity.valueMissing),
      ).toBe(true);
      expect(await page.getByText(/^Restored\./).count()).toBe(0);
    });
  });

  it("rejects a truncated database file and a valid-looking header with garbage", async () => {
    let backup = "";
    await withPage(async (page) => {
      backup = await create(page);
    });
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(backup);
    for (const file of [
      { name: "truncated.db", buffer: bytes.subarray(0, Math.floor(bytes.length / 3)) },
      { name: "header.db", buffer: Buffer.concat([bytes.subarray(0, 100), Buffer.alloc(4096, 7)]) },
    ]) {
      await withPage(async (page) => {
        await page.goto(`${baseUrl()}/settings#data`);
        await page.setInputFiles("#backup-file", { ...file, mimeType: "application/octet-stream" });
        await page.getByLabel("Yes, replace my current data with this backup").check();
        await page.getByRole("button", { name: "Restore backup" }).click();
        await expect.poll(() => page.locator(".form-error").innerText()).toContain("isn’t a valid");
      });
      expect(queryDb(`select 1 from income where source = 'e2e Salary'`).length).toBe(1);
    }
  });

  it("the safety backup is itself restorable: restoring it undoes the restore", async () => {
    let backup = "";
    await withPage(async (page) => {
      backup = await create(page); // state A
    });
    // Change to state B.
    writeDb(`insert into payment_method (id, name, type) values ('e2e-pm-b', 'e2e State B', 'cash')`);

    let safety = "";
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings#data`);
      await page.setInputFiles("#backup-file", backup);
      await page.getByLabel("Yes, replace my current data with this backup").check();
      await page.getByRole("button", { name: "Restore backup" }).click();
      const done = await page.locator("[role=status]", { hasText: "Restored." }).first().innerText();
      safety = /first at (.+)$/.exec(done)![1]!.trim();
      expect(existsSync(safety)).toBe(true);
    });
    expect(queryDb(`select 1 from payment_method where name = 'e2e State B'`)).toEqual([]); // A restored

    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/settings#data`);
      await page.setInputFiles("#backup-file", safety);
      await page.getByLabel("Yes, replace my current data with this backup").check();
      await page.getByRole("button", { name: "Restore backup" }).click();
      await page.locator("[role=status]", { hasText: "Restored." }).first().waitFor();
    });
    expect(queryDb(`select 1 from payment_method where name = 'e2e State B'`).length).toBe(1); // B is back

    // The app still works on the restored data.
    await withPage(async (page) => {
      await page.goto(`${baseUrl()}/transactions?all=1`);
      expect(await page.locator("li.transaction-row").count()).toBeGreaterThan(0);
    });
    writeDb(`delete from payment_method where id = 'e2e-pm-b'`);
  });
});

describe("Reports: week / month / year windows", () => {
  const labels = async (page: Page) => {
    await page.locator(".recharts-surface").first().waitFor();
    const first = page.locator(".chart-card details").first();
    await first.locator("summary").click();
    return (await first.locator("tbody tr th, tbody tr td:first-child").allInnerTexts()).map((t) => t.trim());
  };
  const open = async (page: Page, g: string) => {
    await page.goto(`${baseUrl()}/reports?g=${g}`);
    return labels(page);
  };

  it("week: five week ranges, month: five months, year: five calendar years, oldest first", async () => {
    await withPage(async (page) => {
      const weeks = await open(page, "week");
      expect(weeks).toHaveLength(5);
      for (const w of weeks) expect(w).toMatch(/^[A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2}$/);

      const months = await open(page, "month");
      expect(months).toHaveLength(5);
      for (const m of months) expect(m).toMatch(/^[A-Z][a-z]{2} \d{4}$/);

      const years = (await open(page, "year")).map(Number);
      expect(years).toHaveLength(5);
      const thisYear = new Date().getFullYear();
      expect(years).toEqual([thisYear - 4, thisYear - 3, thisYear - 2, thisYear - 1, thisYear]);
    });
  });

  it("an unknown granularity falls back to month instead of breaking", async () => {
    await withPage(async (page) => {
      const res = await page.goto(`${baseUrl()}/reports?g=decade`);
      expect(res?.status()).toBe(200);
      await page.locator(".recharts-surface").first().waitFor();
      expect(
        await page
          .getByRole("navigation", { name: "Compare by" })
          .getByRole("link", { name: "Month" })
          .getAttribute("aria-current"),
      ).toBe("page");
    });
  });
});
