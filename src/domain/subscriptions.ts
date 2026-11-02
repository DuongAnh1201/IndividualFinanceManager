import { isCurrencyCode } from "./money";
import { clampDay, monthOf, parseDate } from "./period";
import type {
  Category,
  CurrencyCode,
  Expense,
  Id,
  IsoDate,
  IsoMonth,
  IsoTimestamp,
  Subscription,
} from "./types";

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

/**
 * Next charge date strictly after `today` (today's charge, if any, is already owed/posted),
 * honouring startDate and endDate. Null when the subscription has ended or never charges again.
 */
export function nextChargeDate(sub: Subscription, today: IsoDate): IsoDate | null {
  const t = parseDate(today);
  let year = t.year;
  let month = t.month;
  // Billing day is always found within 2 months; 3 iterations also covers startDate in the near future.
  for (let i = 0; i < 24; i++) {
    const chargeDate = clampDay(year, month, sub.billingDay);
    if (sub.endDate !== null && chargeDate > sub.endDate) return null;
    if (chargeDate > today && chargeDate >= sub.startDate) return chargeDate;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return null;
}

/** Subscriptions not ended as of `today` (endDate null or ≥ today). */
export function activeSubscriptions(subs: readonly Subscription[], today: IsoDate): Subscription[] {
  return subs.filter((s) => s.endDate === null || s.endDate >= today);
}

/**
 * Monthly cost of active subscriptions, summed per original currency (no conversion,
 * so no FX rate is needed; sorted by currency code).
 */
export function monthlyTotalsByCurrency(
  subs: readonly Subscription[],
  today: IsoDate,
): { currency: CurrencyCode; amountMinor: number }[] {
  const totals = new Map<CurrencyCode, number>();
  for (const s of activeSubscriptions(subs, today)) {
    totals.set(s.currency, (totals.get(s.currency) ?? 0) + s.amountMinor);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([currency, amountMinor]) => ({ currency, amountMinor }));

export interface SubscriptionInput {
  name: string;
  amountMinor: number;
  currency: string;
  categoryId: Id;
  paymentMethodId: Id;
  billingDay: number;
  startDate: IsoDate;
}

export interface SubscriptionError {
  code:
    | "empty-name"
    | "invalid-amount"
    | "unknown-currency"
    | "unknown-category"
    | "archived-category"
    | "unknown-payment-method"
    | "archived-payment-method"
    | "invalid-billing-day"
    | "invalid-start-date";
  field: keyof SubscriptionInput;
  message: string;
}

export type ValidSubscription = Omit<SubscriptionInput, "currency"> & { currency: CurrencyCode };

export type SubscriptionValidation =
  { ok: true; value: ValidSubscription } | { ok: false; errors: SubscriptionError[] };

/** Validate a subscription's editable fields. Pure; returns all errors at once. */
export function validateSubscription(
  input: SubscriptionInput,
  ctx: {
    categories: readonly Pick<Category, "id" | "archivedAt">[];
    paymentMethods: readonly { id: Id; archivedAt: IsoTimestamp | null }[];
  },
): SubscriptionValidation {
  const errors: SubscriptionError[] = [];
  const fail = (code: SubscriptionError["code"], field: SubscriptionError["field"], message: string) =>
    errors.push({ code, field, message });

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "") fail("empty-name", "name", "Name must not be empty.");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    fail("invalid-amount", "amountMinor", "Amount must be a positive whole number of minor units.");
  }
  const currency = isCurrencyCode(input.currency) ? input.currency : null;
  if (!currency) fail("unknown-currency", "currency", `Unknown currency: ${String(input.currency)}`);
  const cat = ctx.categories.find((c) => c.id === input.categoryId);
  if (!cat) fail("unknown-category", "categoryId", "Unknown category.");
  else if (cat.archivedAt) fail("archived-category", "categoryId", "Category is archived.");
  const pm = ctx.paymentMethods.find((p) => p.id === input.paymentMethodId);
  if (!pm) fail("unknown-payment-method", "paymentMethodId", "Unknown payment method.");
  else if (pm.archivedAt) fail("archived-payment-method", "paymentMethodId", "Payment method is archived.");
  if (!Number.isInteger(input.billingDay) || input.billingDay < 1 || input.billingDay > 31) {
    fail("invalid-billing-day", "billingDay", "Billing day must be 1–31.");
  }
  try {
    parseDate(input.startDate);
  } catch {
    fail("invalid-start-date", "startDate", `Invalid start date: ${String(input.startDate)}`);
  }
  if (errors.length > 0 || !currency) return { ok: false, errors };
  return { ok: true, value: { ...input, name, currency } };
}
