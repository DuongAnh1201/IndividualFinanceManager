import { describe, expect, it } from "vitest";
import { parseGranularity, parseMonth, reportHref, shiftMonth } from "./model";

describe("reports model", () => {
  it("parses granularity, defaulting to month", () => {
    expect(parseGranularity("week")).toBe("week");
    expect(parseGranularity("year")).toBe("year");
    expect(parseGranularity("decade")).toBe("month");
    expect(parseGranularity(undefined)).toBe("month");
    expect(parseGranularity(["week"])).toBe("month");
  });
  it("parses months, never after the current one", () => {
    expect(parseMonth("2026-09", "2026-11")).toBe("2026-09");
    expect(parseMonth("2027-01", "2026-11")).toBe("2026-11");
    expect(parseMonth("2026-13", "2026-11")).toBe("2026-11");
    expect(parseMonth("nope", "2026-11")).toBe("2026-11");
    expect(parseMonth(undefined, "2026-11")).toBe("2026-11");
  });
  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-11", -11)).toBe("2025-12");
    expect(shiftMonth("2026-11", 0)).toBe("2026-11");
  });
  it("builds hrefs", () => {
    expect(reportHref("week", "2026-11")).toBe("/reports?g=week&month=2026-11");
  });
});
