import { clampDay, parseDate } from "../domain/period";
import { dismissReminder as dismiss, pendingReminders } from "../domain/reminders";
import type { IsoDate, Reminder } from "../domain/types";
import { fail, ok, type FieldError, type Result } from "./result";
import type { ServiceDeps } from "./ports";

/** Dismiss a pay-day slot. Only real pay days that are already due can be dismissed. */
export function dismissReminder(
  deps: ServiceDeps,
  slot: IsoDate,
  today?: IsoDate,
): Result<Reminder, FieldError> {
  const { repos, clock } = deps;
  const t = today ?? clock.today();
  let parsed;
  try {
    parsed = parseDate(slot);
  } catch {
    return fail([{ code: "invalid-slot", field: "slot", message: `Invalid pay day: ${String(slot)}` }]);
  }
  const isPayDay = repos.settings.get().payDays.some((d) => clampDay(parsed.year, parsed.month, d) === slot);
  if (!isPayDay)
    return fail([{ code: "not-a-pay-day", field: "slot", message: `${slot} is not a pay day.` }]);
  if (slot > t) return fail([{ code: "not-due", field: "slot", message: `${slot} is not due yet.` }]);
  const reminder = dismiss(slot, clock.now());
  repos.reminders.upsert(reminder);
  return ok(reminder);
}

/**
 * Where missed pay-day slots start counting: `Settings.firstUsedOn` (set once at first
 * use), so a fresh install shows no invented overdue slots while genuinely missed pay
 * days stay pending until resolved. Never later than `today`.
 */
export function getReminderStart(deps: ServiceDeps, today?: IsoDate): IsoDate {
  const { repos, clock } = deps;
  const t = today ?? clock.today();
  const first = repos.settings.get().firstUsedOn;
  return first < t ? first : t;
}

/** Due, unresolved pay-day slots (missed ones included). `since` defaults to `getReminderStart`. */
export function getPendingReminders(deps: ServiceDeps, since?: IsoDate, today?: IsoDate): IsoDate[] {
  const { repos, clock } = deps;
  return pendingReminders({
    payDays: repos.settings.get().payDays,
    today: today ?? clock.today(),
    since: since ?? getReminderStart(deps, today),
    incomes: repos.incomes.list(),
    stored: repos.reminders.list(),
  });
}
