import { bottleBalances } from "../domain/bottleBalances";
import {
  createRuleVersion,
  removeBottle as removeBottleRule,
  resplitIncome as resplitRule,
} from "../domain/bottleRules";
import { activeRuleVersion } from "../domain/bottleSplit";
import type { BottleRatio, BottleRuleVersion, Id, Income } from "../domain/types";
import { fail, notFound, ok, type FieldError, type Result } from "./result";
import type { ServiceDeps } from "./ports";

function bad(code: string, field: string, message: string): Result<never> {
  return fail([{ code, field, message }]);
}

/** BR-4: save new ratios as a NEW rule version (existing versions/allocations untouched). */
export function editBottleRules(
  deps: ServiceDeps,
  ratios: readonly BottleRatio[],
  note?: string | null,
): Result<BottleRuleVersion, FieldError> {
  const { repos, clock } = deps;
  return repos.transaction(() => {
    const bottles = repos.bottles.list();
    const active = new Set(bottles.filter((b) => b.archivedAt === null).map((b) => b.id));
    if (ratios.some((r) => !active.has(r.bottleId))) {
      return bad("unknown-bottle", "ratios", "Ratios may only use active bottles.");
    }
    let version: BottleRuleVersion;
    try {
      version = createRuleVersion({ id: clock.newId(), effectiveFrom: clock.now(), note, ratios, bottles });
    } catch (e) {
      return bad("invalid-ratios", "ratios", (e as Error).message);
    }
    repos.ruleVersions.insert(version);
    return ok(version);
  });
}

/** BR-4: manual re-split of one past income with the rule active now. */
export function resplitIncome(deps: ServiceDeps, incomeId: Id): Result<Income, FieldError> {
  const { repos, clock } = deps;
  return repos.transaction(() => {
    const income = repos.incomes.get(incomeId);
    if (!income) return notFound("Income");
    const rule = activeRuleVersion(repos.ruleVersions.list(), clock.now());
    if (!rule) return bad("no-rule", "bottleRuleVersionId", "No bottle rule is active.");
    const out = resplitRule(income, rule, clock.newId);
    repos.incomes.update(out.income);
    repos.allocations.replaceForIncome(income.id, out.allocations);
    return ok(out.income);
  });
}

/**
 * BR-4 / D-018: remove a bottle in one transaction — archive it, move its balance to
 * `targetBottleId`, repoint categories, and save a new rule version without it.
 */
export function removeBottle(
  deps: ServiceDeps,
  bottleId: Id,
  targetBottleId?: Id,
): Result<{ transferred: boolean }, FieldError> {
  const { repos, clock } = deps;
  return repos.transaction(() => {
    const bottles = repos.bottles.list();
    const settings = repos.settings.get();
    const now = clock.now();
    const current = activeRuleVersion(repos.ruleVersions.list(), now);
    if (!current) return bad("no-rule", "bottleRuleVersionId", "No bottle rule is active.");
    const { balances } = bottleBalances(
      bottles,
      repos.allocations.list(),
      repos.incomes.list(),
      repos.transfers.list(),
      repos.expenses.list(),
      settings.baseCurrency,
      repos.exchangeRates.list(),
    );
    const balance = balances.find((b) => b.bottleId === bottleId);
    if (!balance) return notFound("Bottle");
    let r;
    try {
      r = removeBottleRule({
        bottleId,
        bottles,
        balance,
        baseCurrency: settings.baseCurrency,
        targetBottleId,
        categories: repos.categories.list(),
        currentRule: current,
        newRuleId: clock.newId(),
        newTransferId: clock.newId(),
        today: clock.today(),
        now,
      });
    } catch (e) {
      return bad("cannot-remove", "bottleId", (e as Error).message);
    }
    repos.bottles.update(r.bottle);
    if (r.transfer) repos.transfers.insert(r.transfer);
    for (const c of r.categories) repos.categories.update(c);
    repos.ruleVersions.insert(r.ruleVersion);
    return ok({ transferred: r.transfer !== null });
  });
}
