import { describe, expect, it } from "vitest";
import {
  addDays,
  clampDay,
  dayOfWeek,
  daysInMonth,
  lastNPeriods,
  monthOf,
  nextPeriod,
  periodContains,
  periodOf,
  previousPeriod,
} from "./period";

describe("daysInMonth / clampDay / monthOf", () => {
  it("handles leap years", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
  it("clamps billing days to month end", () => {
    expect(clampDay(2026, 2, 31)).toBe("2026-02-28");
    expect(clampDay(2024, 2, 31)).toBe("2024-02-29");
    expect(clampDay(2026, 4, 31)).toBe("2026-04-30");
    expect(clampDay(2026, 1, 31)).toBe("2026-01-31");
    expect(clampDay(2026, 5, 10)).toBe("2026-05-10");
  });
  it("monthOf", () => {
    expect(monthOf("2026-11-01")).toBe("2026-11");
  });
  it("rejects invalid input", () => {
    expect(() => monthOf("2026-13-01")).toThrow();
    expect(() => monthOf("2026-02-30")).toThrow();
    expect(() => monthOf("nope")).toThrow();
    expect(() => daysInMonth(2026, 0)).toThrow();
    expect(() => clampDay(2026, 2, 0)).toThrow();
  });
});

describe("addDays / dayOfWeek", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-11-01", 0)).toBe("2026-11-01");
  });
  it("computes weekday", () => {
    expect(dayOfWeek("1970-01-01")).toBe(4);
    expect(dayOfWeek("2026-11-01")).toBe(0); // Sunday
    expect(dayOfWeek("2026-11-02")).toBe(1);
    expect(dayOfWeek("1969-12-31")).toBe(3);
  });
});

describe("periodOf", () => {
  it("month", () => {
    expect(periodOf("month", "2026-11-15")).toEqual({
      granularity: "month",
      id: "2026-11",
      start: "2026-11-01",
      end: "2026-12-01",
    });
    expect(periodOf("month", "2026-12-31").end).toBe("2027-01-01");
    expect(periodOf("month", "2024-02-29").end).toBe("2024-03-01");
  });
  it("year", () => {
    expect(periodOf("year", "2026-06-30")).toEqual({
      granularity: "year",
      id: "2026",
      start: "2026-01-01",
      end: "2027-01-01",
    });
  });
  it("week defaults to Monday start", () => {
    // 2026-11-01 is a Sunday → week began Monday 2026-10-26.
    expect(periodOf("week", "2026-11-01")).toEqual({
      granularity: "week",
      id: "2026-10-26",
      start: "2026-10-26",
      end: "2026-11-02",
    });
    // Monday is the first day of its own week.
    expect(periodOf("week", "2026-11-02").start).toBe("2026-11-02");
  });
  it("week with Sunday start", () => {
    expect(periodOf("week", "2026-11-01", 0).start).toBe("2026-11-01");
    expect(periodOf("week", "2026-11-07", 0).start).toBe("2026-11-01");
    expect(periodOf("week", "2026-11-08", 0).start).toBe("2026-11-08");
  });
  it("week spanning year boundary", () => {
    const p = periodOf("week", "2027-01-01"); // Friday
    expect(p.start).toBe("2026-12-28");
    expect(p.end).toBe("2027-01-04");
  });
});

describe("periodContains (half-open)", () => {
  const p = periodOf("month", "2026-11-15");
  it("includes start, excludes end", () => {
    expect(periodContains(p, "2026-11-01")).toBe(true);
    expect(periodContains(p, "2026-11-30")).toBe(true);
    expect(periodContains(p, "2026-12-01")).toBe(false);
    expect(periodContains(p, "2026-10-31")).toBe(false);
  });
});

describe("previous / next / lastNPeriods", () => {
  it("previous and next are inverse", () => {
    const p = periodOf("month", "2026-01-10");
    expect(previousPeriod(p).id).toBe("2025-12");
    expect(nextPeriod(previousPeriod(p))).toEqual(p);
  });
  it("last 5 months, oldest first, crossing the year", () => {
    expect(lastNPeriods("month", 5, "2026-02-14").map((p) => p.id)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
  it("last 5 years", () => {
    expect(lastNPeriods("year", 5, "2026-11-01").map((p) => p.id)).toEqual([
      "2022",
      "2023",
      "2024",
      "2025",
      "2026",
    ]);
  });
  it("last 3 weeks are contiguous", () => {
    const ps = lastNPeriods("week", 3, "2026-11-01");
    expect(ps.map((p) => p.id)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(ps[0]?.end).toBe(ps[1]?.start);
    expect(ps[1]?.end).toBe(ps[2]?.start);
  });
  it("respects week start", () => {
    expect(lastNPeriods("week", 2, "2026-11-01", 0).map((p) => p.id)).toEqual(["2026-10-25", "2026-11-01"]);
  });
  it("n=1 is the current period; invalid n throws", () => {
    expect(lastNPeriods("month", 1, "2026-11-01")).toEqual([periodOf("month", "2026-11-01")]);
    expect(() => lastNPeriods("month", 0, "2026-11-01")).toThrow();
  });
});
