import { describe, expect, it } from "vitest";
import type { LivingLimitStatus } from "@/domain/types";
import { barPercent, moodFor, percentLabel, shares, statusMessage } from "./model";

const status = (kind: LivingLimitStatus["status"], ratio: number): LivingLimitStatus => ({
  month: "2026-11",
  limitMinor: 100,
  spentMinor: Math.round(ratio * 100),
  ratio,
  status: kind,
});

describe("dashboard model", () => {
  it("maps living-limit status to Penny's mood", () => {
    expect(moodFor(null)).toBe("happy");
    expect(moodFor(status("ok", 0.4))).toBe("happy");
    expect(moodFor(status("warning", 0.85))).toBe("worried");
    expect(moodFor(status("over", 1.2))).toBe("dizzy");
  });

  it("has a text message for every status (not mood alone)", () => {
    expect(statusMessage(null).title).toMatch(/no living limit/i);
    expect(statusMessage(status("ok", 0.1)).title).toMatch(/within/i);
    expect(statusMessage(status("warning", 0.9), 75)).toEqual({
      title: "Getting close",
      detail: "You’ve reached your 75% warning level.",
    });
    expect(statusMessage(status("over", 1.1)).title).toMatch(/over/i);
  });

  it("clamps bar fill and labels percentages", () => {
    expect(barPercent(0.834)).toBe(83);
    expect(barPercent(2)).toBe(100);
    expect(barPercent(-1)).toBe(0);
    expect(barPercent(Infinity)).toBe(100);
    expect(percentLabel(0.834)).toBe("83%");
    expect(percentLabel(Infinity)).toBe("over");
  });

  it("computes shares of a total", () => {
    const rows = shares([{ v: 30 }, { v: 70 }], (x) => x.v);
    expect(rows.map((r) => r.percent)).toEqual([30, 70]);
    expect(shares([{ v: 0 }], (x) => x.v)[0]?.percent).toBe(0);
    expect(shares([], () => 0)).toEqual([]);
  });
});
