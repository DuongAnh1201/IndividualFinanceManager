import { dismissReminder as dismiss, pendingReminders } from "../domain/reminders";
import type { IsoDate, Reminder } from "../domain/types";
import type { ServiceDeps } from "./ports";

export function dismissReminder(deps: ServiceDeps, slot: IsoDate): Reminder {
  const { repos, clock } = deps;
  const reminder = dismiss(slot, clock.now());
  repos.reminders.upsert(reminder);
  return reminder;
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
