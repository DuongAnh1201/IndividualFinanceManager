import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { inject } from "vitest";

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Launches the system Chrome (override with CHROME_PATH). No browser download is needed. */
export async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.CHROME_PATH ?? (existsSync(MAC_CHROME) ? MAC_CHROME : undefined);
  return chromium.launch(
    executablePath ? { executablePath, headless: true } : { channel: "chrome", headless: true },
  );
}

export const baseUrl = () => inject("baseUrl");

export const DESKTOP = { width: 1280, height: 800 };
export const MOBILE = { width: 390, height: 844 };

export async function newPage(
  browser: Browser,
  viewport = DESKTOP,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport, locale: "en-US", timezoneId: "America/Los_Angeles" });
  const page = await context.newPage();
  return { context, page };
}

/** Collects uncaught page errors and console errors so tests can assert a clean page. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** True when the page scrolls horizontally (content wider than the viewport). */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

export interface A11yIssue {
  rule: string;
  detail: string;
}

/** Axe-style basic checks that need no extra dependency. */
export async function basicA11y(page: Page): Promise<A11yIssue[]> {
  return page.evaluate(() => {
    const issues: { rule: string; detail: string }[] = [];
    const add = (rule: string, el: Element | string) =>
      issues.push({ rule, detail: typeof el === "string" ? el : el.outerHTML.slice(0, 120) });

    if (!document.documentElement.lang) add("html-has-lang", "<html> has no lang");
    if (!document.title.trim()) add("document-title", "page has no <title>");
    if (document.querySelectorAll("h1").length !== 1) {
      add("page-has-one-h1", `found ${document.querySelectorAll("h1").length} <h1>`);
    }
    if (!document.querySelector("main, [role=main]")) add("landmark-main", "no <main> landmark");

    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const nameOf = (el: Element): string => {
      const aria = el.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const by = el.getAttribute("aria-labelledby");
      if (by) {
        const t = by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
        if (t) return t;
      }
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        const label = el.labels
          ? [...el.labels]
              .map((l) => l.textContent ?? "")
              .join(" ")
              .trim()
          : "";
        if (label) return label;
        if (el.getAttribute("title")?.trim()) return el.getAttribute("title")!.trim();
        return "";
      }
      const text = el.textContent?.trim() ?? "";
      if (text) return text;
      return (
        el.querySelector("img[alt]:not([alt=''])")?.getAttribute("alt") ?? el.getAttribute("title") ?? ""
      );
    };

    for (const el of document.querySelectorAll("button, a[href], [role=button]")) {
      if (visible(el) && !nameOf(el)) add("accessible-name", el);
    }
    for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
      if (visible(el) && !nameOf(el)) add("form-label", el);
    }
    for (const img of document.querySelectorAll("img")) {
      if (!img.hasAttribute("alt")) add("image-alt", img);
    }
    const ids = new Map<string, number>();
    for (const el of document.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    for (const [id, n] of ids) if (n > 1) add("duplicate-id", `#${id} x${n}`);
    return issues;
  });
}

export interface TabStop {
  label: string;
  /** Outline or box-shadow present while focused via keyboard. */
  focusVisible: boolean;
}

/** Tabs through the page (up to `max` stops, stopping when focus leaves the page or repeats). */
export async function tabAudit(page: Page, max = 40): Promise<TabStop[]> {
  const stops: TabStop[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const txt =
        el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.getAttribute("href") ?? el.tagName;
      return {
        label: `${el.tagName.toLowerCase()}:${txt.slice(0, 40)}`,
        focusVisible:
          (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
          (s.boxShadow !== "none" && s.boxShadow !== ""),
      };
    });
    if (!stop || stops.some((x) => x.label === stop.label)) break;
    stops.push(stop);
  }
  return stops;
}
