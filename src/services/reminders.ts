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

/** Due, unresolved pay-day slots (missed ones included) since `since`. */
export function getPendingReminders(deps: ServiceDeps, since: IsoDate, today?: IsoDate): IsoDate[] {
  const { repos, clock } = deps;
  return pendingReminders({
    payDays: repos.settings.get().payDays,
    today: today ?? clock.today(),
    since,
    incomes: repos.incomes.list(),
    stored: repos.reminders.list(),
  });
}
