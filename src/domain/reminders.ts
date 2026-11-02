import { clampDay, parseDate } from "./period";
import type { Income, IsoDate, IsoTimestamp, Reminder } from "./types";

export type ReminderState = "pending" | "done" | "dismissed";

export interface ReminderView {
  /** Pay day `YYYY-MM-DD`. */
  slot: IsoDate;
  status: ReminderState;
  /** Income that resolved the slot, if status is "done" via an income. */
  incomeId: string | null;
}

export function validatePayDays(payDays: readonly number[]): void {
  if (payDays.length === 0) throw new RangeError("at least one pay day is required");
  if (payDays.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) {
    throw new RangeError("pay days must be integers 1–31");
  }
}

/** All pay-day slots from `fromMonth` through `toMonth` (inclusive, 1-based months), ascending, de-duplicated. */
function slotsBetween(
  payDays: readonly number[],
  from: { year: number; month: number },
  to: { year: number; month: number },
): IsoDate[] {
  const out: IsoDate[] = [];
  let { year, month } = from;
  while (year < to.year || (year === to.year && month <= to.month)) {
    const monthSlots = payDays.map((d) => clampDay(year, month, d));
    out.push(...[...new Set(monthSlots)].sort());
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

/**
 * BR-5: the status of every pay-day slot that is due (`today ≥ slot`) and not before
 * `since` (e.g. when the app was first used; limits how far back missed slots go).
 *
 * A slot is **done** when an income has `payDaySlot === slot`, or an income without
 * a `payDaySlot` is dated within the slot's window `[slot, nextPayDay)`. It is
 * **dismissed** if the user dismissed it (and it is not done). Otherwise **pending**
 * — missed slots stay pending until resolved. `stored` are persisted reminder rows
 * (explicit done/dismissed).
 */
export function reminderViews(input: {
  payDays: readonly number[];
  today: IsoDate;
  since: IsoDate;
  incomes: readonly Pick<Income, "id" | "date" | "payDaySlot">[];
  stored: readonly Reminder[];
}): ReminderView[] {
  const { payDays, today, since, incomes, stored } = input;
  validatePayDays(payDays);
  const t = parseDate(today);
  const s = parseDate(since);
  // One month past `today` so the last due slot has a window end.
  const nextMonth = t.month === 12 ? { year: t.year + 1, month: 1 } : { year: t.year, month: t.month + 1 };
  const all = slotsBetween(payDays, { year: s.year, month: s.month }, nextMonth);
  const storedBySlot = new Map(stored.map((r) => [r.slot, r]));

  const views: ReminderView[] = [];
  all.forEach((slot, i) => {
    if (slot > today || slot < since) return;
    const next = all[i + 1] ?? "9999-12-31";
    const resolver = incomes.find(
      (inc) => inc.payDaySlot === slot || (inc.payDaySlot === null && inc.date >= slot && inc.date < next),
    );
    const row = storedBySlot.get(slot);
    if (resolver || row?.status === "done") {
      views.push({ slot, status: "done", incomeId: resolver?.id ?? null });
    } else if (row?.status === "dismissed") {
      views.push({ slot, status: "dismissed", incomeId: null });
    } else {
      views.push({ slot, status: "pending", incomeId: null });
    }
  });
  return views;
}

/** Slots the UI should show now: due and unresolved (missed ones included). */
export function pendingReminders(input: Parameters<typeof reminderViews>[0]): IsoDate[] {
  return reminderViews(input)
    .filter((v) => v.status === "pending")
    .map((v) => v.slot);
}

/** User dismisses a slot. */
export function dismissReminder(slot: IsoDate, now: IsoTimestamp): Reminder {
  parseDate(slot);
  return { slot, status: "dismissed", resolvedAt: now };
}

/** Persist a slot as done (e.g. when an income is saved with that payDaySlot). */
export function completeReminder(slot: IsoDate, now: IsoTimestamp): Reminder {
  parseDate(slot);
  return { slot, status: "done", resolvedAt: now };
}

/** The slot an income dated `date` belongs to (latest slot ≤ date), if any is on/after `since`. */
export function slotForDate(payDays: readonly number[], date: IsoDate): IsoDate | null {
  validatePayDays(payDays);
  const d = parseDate(date);
  const prev = d.month === 1 ? { year: d.year - 1, month: 12 } : { year: d.year, month: d.month - 1 };
  const candidates = slotsBetween(payDays, prev, { year: d.year, month: d.month }).filter((s) => s <= date);
  return candidates[candidates.length - 1] ?? null;
}
