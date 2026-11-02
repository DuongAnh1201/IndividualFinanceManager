import { clampDay, monthOf, parseDate } from "./period";
import type { Category, Expense, Id, IsoDate, IsoMonth, IsoTimestamp, Subscription } from "./types";

/** Idempotency key for a posted charge: one expense per (subscription, billing month). */
export function chargeKey(subscriptionId: Id, billingMonth: IsoMonth): string {
  return `${subscriptionId}|${billingMonth}`;
}

export interface OwedCharge {
  subscriptionId: Id;
  billingMonth: IsoMonth;
  /** billingDay in that month, clamped to the last day. */
  chargeDate: IsoDate;
}

/**
 * BR-1: every billing month of `sub` that is owed as of `today`, oldest first.
 * A month is owed when startDate ≤ chargeDate ≤ today and (endDate is null or
 * endDate ≥ chargeDate). Does not look at what was already posted.
 */
export function owedCharges(sub: Subscription, today: IsoDate): OwedCharge[] {
  const start = parseDate(sub.startDate);
  const end = parseDate(today);
  const out: OwedCharge[] = [];
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    const chargeDate = clampDay(year, month, sub.billingDay);
    const active = chargeDate >= sub.startDate && (sub.endDate === null || sub.endDate >= chargeDate);
    if (active && chargeDate <= today) {
      out.push({ subscriptionId: sub.id, billingMonth: monthOf(chargeDate), chargeDate });
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

export interface PostDueInput {
  subscriptions: readonly Subscription[];
  /** Already-posted charges as `chargeKey(...)` strings (from existing expenses). */
  postedKeys: ReadonlySet<string>;
  /** Used to default the expense's bottle from its category. */
  categories: readonly Pick<Category, "id" | "defaultBottleId">[];
  today: IsoDate;
  /** Timestamp for createdAt/updatedAt (injected; domain never reads the clock). */
  now: IsoTimestamp;
  newId: () => Id;
}

/**
 * BR-1: expenses to create now. Idempotent (skips keys in `postedKeys`, and never
 * repeats a key within one call), catches up missed months, uses the subscription's
 * current price (earlier posted charges are untouched, so a price change only
 * affects charges posted afterwards). FX is left null; conversion happens at report
 * time (BR-8).
 */
export function postDueSubscriptionExpenses(input: PostDueInput): Expense[] {
  const { subscriptions, postedKeys, categories, today, now, newId } = input;
  const bottleByCategory = new Map(categories.map((c) => [c.id, c.defaultBottleId]));
  const seen = new Set(postedKeys);
  const out: Expense[] = [];
  for (const sub of subscriptions) {
    for (const charge of owedCharges(sub, today)) {
      const key = chargeKey(sub.id, charge.billingMonth);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: newId(),
        date: charge.chargeDate,
        amountMinor: sub.amountMinor,
        currency: sub.currency,
        fxRateToBase: null,
        categoryId: sub.categoryId,
        paymentMethodId: sub.paymentMethodId,
        bottleId: bottleByCategory.get(sub.categoryId) ?? null,
        note: sub.name,
        source: "subscription",
        subscriptionId: sub.id,
        billingMonth: charge.billingMonth,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return out;
}

/** Remove = set endDate (history stays; no future posts). Returns the updated subscription. */
export function endSubscription(sub: Subscription, endDate: IsoDate, now: IsoTimestamp): Subscription {
  parseDate(endDate);
  return { ...sub, endDate, updatedAt: now };
}

/** Price change: only affects charges posted after this call. */
export function changeSubscriptionPrice(
  sub: Subscription,
  amountMinor: number,
  now: IsoTimestamp,
): Subscription {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new RangeError("amountMinor must be a positive integer");
  }
  return { ...sub, amountMinor, updatedAt: now };
}
