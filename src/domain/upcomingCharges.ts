import { addDays, monthOf } from "./period";
import { nextChargeDate } from "./subscriptions";
import type { Id, IsoDate, IsoMonth, Subscription } from "./types";

export interface UpcomingCharge {
  subscriptionId: Id;
  billingMonth: IsoMonth;
  chargeDate: IsoDate;
}

/**
 * Charges falling after `today` and up to `today + days` (inclusive), soonest first
 * (ties by subscription id). Built on `nextChargeDate`, so billing-day clamping and
 * start/end dates follow BR-1; today's own charge is excluded (already owed/posted).
 * A subscription can appear more than once if the window spans several billing months.
 */
export function upcomingCharges(subs: readonly Subscription[], today: IsoDate, days = 30): UpcomingCharge[] {
  if (!Number.isInteger(days) || days < 1) throw new RangeError(`days must be a positive integer: ${days}`);
  const until = addDays(today, days);
  const out: UpcomingCharge[] = [];
  for (const sub of subs) {
    let cursor = today;
    for (;;) {
      const next = nextChargeDate(sub, cursor);
      if (next === null || next > until) break;
      out.push({ subscriptionId: sub.id, billingMonth: monthOf(next), chargeDate: next });
      cursor = next;
    }
  }
  return out.sort(
    (a, b) => a.chargeDate.localeCompare(b.chargeDate) || a.subscriptionId.localeCompare(b.subscriptionId),
  );
}
