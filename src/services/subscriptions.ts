import {
  changeSubscriptionPrice as changePrice,
  chargeKey,
  endSubscription as endSub,
  postDueSubscriptionExpenses,
  validateSubscription,
  type SubscriptionInput,
} from "../domain/subscriptions";
import type { Expense, Id, IsoDate, Subscription } from "../domain/types";
import { fail, notFound, ok, type FieldError, type Result } from "./result";
import type { ServiceDeps } from "./ports";

/** BR-1: post every owed subscription charge up to `today` (default: clock). Idempotent. */
export function runSubscriptionAutopost(deps: ServiceDeps, today?: IsoDate): Expense[] {
  const { repos, clock } = deps;
  return repos.transaction(() => {
    const posted = postDueSubscriptionExpenses({
      subscriptions: repos.subscriptions.list(),
      postedKeys: repos.expenses.postedChargeKeys(),
      categories: repos.categories.list(),
      today: today ?? clock.today(),
      now: clock.now(),
      newId: clock.newId,
    });
    if (posted.length > 0) repos.expenses.insertMany(posted);
    return posted;
  });
}

function subscriptionContext({ repos }: ServiceDeps) {
  return { categories: repos.categories.list(), paymentMethods: repos.paymentMethods.list() };
}

export function createSubscription(
  deps: ServiceDeps,
  input: SubscriptionInput,
): Result<Subscription, FieldError> {
  const { repos, clock } = deps;
  return repos.transaction(() => {
    const v = validateSubscription(input, subscriptionContext(deps));
    if (!v.ok) return fail(v.errors);
    const now = clock.now();
    const sub: Subscription = {
      id: clock.newId(),
      ...v.value,
      endDate: null,
      createdAt: now,
      updatedAt: now,
    };
    repos.subscriptions.insert(sub);
    return ok(sub);
  });
}

/**
 * Edit a subscription. A changed price applies to charges posted afterwards only (BR-1);
 * already-posted expenses are untouched.
 */
export function updateSubscription(
  deps: ServiceDeps,
  id: Id,
  input: SubscriptionInput,
): Result<Subscription, FieldError> {
  const { repos, clock } = deps;
  return repos.transaction(() => {
    const existing = repos.subscriptions.get(id);
    if (!existing) return notFound("Subscription");
    const v = validateSubscription(input, subscriptionContext(deps));
    if (!v.ok) return fail(v.errors);
    const sub: Subscription = { ...existing, ...v.value, updatedAt: clock.now() };
    repos.subscriptions.update(sub);
    return ok(sub);
  });
}

export function endSubscription(
  deps: ServiceDeps,
  id: Id,
  endDate?: IsoDate,
): Result<Subscription, FieldError> {
  const { repos, clock } = deps;
  return repos.transaction(() => {
    const existing = repos.subscriptions.get(id);
    if (!existing) return notFound("Subscription");
    const sub = endSub(existing, endDate ?? clock.today(), clock.now());
    repos.subscriptions.update(sub);
    return ok(sub);
  });
}

export function changeSubscriptionPrice(
  deps: ServiceDeps,
  id: Id,
  amountMinor: number,
): Result<Subscription, FieldError> {
  const { repos, clock } = deps;
  return repos.transaction(() => {
    const existing = repos.subscriptions.get(id);
    if (!existing) return notFound("Subscription");
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      return fail([
        { code: "invalid-amount", field: "amountMinor", message: "Amount must be a positive whole number." },
      ]);
    }
    const sub = changePrice(existing, amountMinor, clock.now());
    repos.subscriptions.update(sub);
    return ok(sub);
  });
}

export { chargeKey };

/** "Remove" a subscription = set endDate to today (D-017); past expenses stay, no future posts. */
export function removeSubscription(deps: ServiceDeps, id: Id): Result<Subscription, FieldError> {
  return endSubscription(deps, id);
}
