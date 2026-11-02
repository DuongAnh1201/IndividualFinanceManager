import { describe, expect, it } from "vitest";
import {
  completeReminder,
  dismissReminder,
  pendingReminders,
  reminderViews,
  slotForDate,
  validatePayDays,
} from "./reminders";

const NOW = "2026-11-12T00:00:00Z";
const base = { payDays: [10, 25], since: "2026-11-01", incomes: [], stored: [] };
const inc = (id: string, date: string, payDaySlot: string | null = null) => ({ id, date, payDaySlot });

describe("pay-day reminders (BR-5)", () => {
  it("is not due before the first pay day", () => {
    expect(pendingReminders({ ...base, today: "2026-11-09" })).toEqual([]);
  });

  it("is due on the pay day and stays pending", () => {
    expect(pendingReminders({ ...base, today: "2026-11-10" })).toEqual(["2026-11-10"]);
    expect(pendingReminders({ ...base, today: "2026-11-24" })).toEqual(["2026-11-10"]);
    expect(pendingReminders({ ...base, today: "2026-11-25" })).toEqual(["2026-11-10", "2026-11-25"]);
  });

  it("an income linked by payDaySlot resolves that slot only", () => {
    const v = reminderViews({
      ...base,
      today: "2026-11-26",
      incomes: [inc("i1", "2026-11-12", "2026-11-10")],
    });
    expect(v).toEqual([
      { slot: "2026-11-10", status: "done", incomeId: "i1" },
      { slot: "2026-11-25", status: "pending", incomeId: null },
    ]);
  });

  it("an unlinked income dated within the window resolves the slot", () => {
    const v = reminderViews({ ...base, today: "2026-11-30", incomes: [inc("i1", "2026-11-27")] });
    expect(v.map((x) => [x.slot, x.status])).toEqual([
      ["2026-11-10", "pending"],
      ["2026-11-25", "done"],
    ]);
  });

  it("window ends at the next pay day (income on 25th does not resolve the 10th)", () => {
    const v = reminderViews({ ...base, today: "2026-11-30", incomes: [inc("i1", "2026-11-25")] });
    expect(v.map((x) => x.status)).toEqual(["pending", "done"]);
  });

  it("window of the last slot extends into next month until the next pay day", () => {
    const v = reminderViews({
      ...base,
      since: "2026-11-25",
      today: "2026-12-05",
      incomes: [inc("i1", "2026-12-03")],
    });
    expect(v).toEqual([{ slot: "2026-11-25", status: "done", incomeId: "i1" }]);
  });

  it("missed slots from earlier months stay visible", () => {
    expect(pendingReminders({ ...base, since: "2026-09-01", today: "2026-11-10" })).toEqual([
      "2026-09-10",
      "2026-09-25",
      "2026-10-10",
      "2026-10-25",
      "2026-11-10",
    ]);
  });

  it("respects `since` (older slots ignored)", () => {
    expect(pendingReminders({ ...base, since: "2026-11-11", today: "2026-11-26" })).toEqual(["2026-11-25"]);
  });

  it("dismissed slots are not pending; stored done counts", () => {
    const v = reminderViews({
      ...base,
      today: "2026-11-26",
      stored: [dismissReminder("2026-11-10", NOW), completeReminder("2026-11-25", NOW)],
    });
    expect(v.map((x) => x.status)).toEqual(["dismissed", "done"]);
  });

  it("an income resolves even a dismissed slot (done wins)", () => {
    const v = reminderViews({
      ...base,
      today: "2026-11-20",
      incomes: [inc("i1", "2026-11-11")],
      stored: [dismissReminder("2026-11-10", NOW)],
    });
    expect(v[0]?.status).toBe("done");
  });

  it("clamps pay days to month end and de-duplicates", () => {
    const feb = pendingReminders({
      payDays: [30, 31],
      since: "2026-02-01",
      today: "2026-02-28",
      incomes: [],
      stored: [],
    });
    expect(feb).toEqual(["2026-02-28"]);
    const jan = pendingReminders({
      payDays: [31],
      since: "2026-01-01",
      today: "2026-02-28",
      incomes: [],
      stored: [],
    });
    expect(jan).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("crosses year boundaries and handles unsorted/duplicate pay days", () => {
    expect(
      pendingReminders({
        payDays: [25, 10, 10],
        since: "2026-12-01",
        today: "2027-01-10",
        incomes: [],
        stored: [],
      }),
    ).toEqual(["2026-12-10", "2026-12-25", "2027-01-10"]);
  });

  it("validates pay days", () => {
    expect(() => validatePayDays([])).toThrow(RangeError);
    expect(() => validatePayDays([0])).toThrow(RangeError);
    expect(() => validatePayDays([32])).toThrow(RangeError);
    expect(() => validatePayDays([1.5])).toThrow(RangeError);
    expect(() => pendingReminders({ ...base, payDays: [], today: "2026-11-10" })).toThrow(RangeError);
  });

  it("builds reminder rows", () => {
    expect(dismissReminder("2026-11-10", NOW)).toEqual({
      slot: "2026-11-10",
      status: "dismissed",
      resolvedAt: NOW,
    });
    expect(completeReminder("2026-11-10", NOW).status).toBe("done");
    expect(() => dismissReminder("nope", NOW)).toThrow(RangeError);
  });
});

describe("slotForDate", () => {
  it("returns the latest pay day on/before the date", () => {
    expect(slotForDate([10, 25], "2026-11-10")).toBe("2026-11-10");
    expect(slotForDate([10, 25], "2026-11-24")).toBe("2026-11-10");
    expect(slotForDate([10, 25], "2026-11-26")).toBe("2026-11-25");
    expect(slotForDate([10, 25], "2026-11-05")).toBe("2026-10-25");
    expect(slotForDate([10, 25], "2027-01-05")).toBe("2026-12-25");
  });
});
