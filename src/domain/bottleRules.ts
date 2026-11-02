import { allocateIncome } from "./bottleSplit";
import type {
  Bottle,
  BottleAllocation,
  BottleBalance,
  BottleRatio,
  BottleRuleVersion,
  BottleTransfer,
  Category,
  CurrencyCode,
  Id,
  Income,
  IsoDate,
  IsoTimestamp,
} from "./types";

/** Ratios must be positive integers, unique per bottle, and non-empty. */
export function validateRatios(ratios: readonly BottleRatio[]): void {
  if (ratios.length === 0) throw new RangeError("at least one bottle ratio is required");
  if (ratios.some((r) => !Number.isInteger(r.ratio) || r.ratio <= 0)) {
    throw new RangeError("ratios must be positive integers");
  }
  if (new Set(ratios.map((r) => r.bottleId)).size !== ratios.length) {
    throw new RangeError("duplicate bottle in ratios");
  }
}

/** Live percentages for display (BR-4: "shown as % live"); sum may differ from 100 by rounding. */
export function ratioPercentages(ratios: readonly BottleRatio[]): { bottleId: Id; percent: number }[] {
  validateRatios(ratios);
  const total = ratios.reduce((s, r) => s + r.ratio, 0);
  return ratios.map((r) => ({ bottleId: r.bottleId, percent: (r.ratio / total) * 100 }));
}

/** Order ratios by bottle sortOrder (D-016) so the remainder lands on the first bottle. */
export function orderRatios(ratios: readonly BottleRatio[], bottles: readonly Bottle[]): BottleRatio[] {
  const order = new Map(bottles.map((b) => [b.id, b.sortOrder]));
  for (const r of ratios) {
    if (!order.has(r.bottleId)) throw new RangeError(`unknown bottle: ${r.bottleId}`);
  }
  return [...ratios].sort((a, b) => order.get(a.bottleId)! - order.get(b.bottleId)!);
}

/**
 * BR-4: editing rules creates a NEW version; existing versions and allocations are
 * never mutated. Ratios are ordered by bottle sortOrder.
 */
export function createRuleVersion(input: {
  id: Id;
  effectiveFrom: IsoTimestamp;
  note?: string | null;
  ratios: readonly BottleRatio[];
  bottles: readonly Bottle[];
}): BottleRuleVersion {
  validateRatios(input.ratios);
  return {
    id: input.id,
    effectiveFrom: input.effectiveFrom,
    note: input.note ?? null,
    ratios: orderRatios(input.ratios, input.bottles),
  };
}

export function renameBottle(bottle: Bottle, name: string): Bottle {
  const trimmed = name.trim();
  if (trimmed === "") throw new RangeError("bottle name must not be empty");
  return { ...bottle, name: trimmed };
}

/** Manual re-split of one past income with a (newer) rule; replaces its allocations. */
export function resplitIncome(
  income: Income,
  rule: BottleRuleVersion,
  newId: () => Id,
): { income: Income; allocations: BottleAllocation[] } {
  return {
    income: { ...income, bottleRuleVersionId: rule.id },
    allocations: allocateIncome(income, rule, newId),
  };
}

export interface RemoveBottleResult {
  /** The bottle, archived (history stays). */
  bottle: Bottle;
  /** Moves the balance to the target; null when the balance is zero. */
  transfer: BottleTransfer | null;
  /** Categories whose default bottle was the removed one, now pointing at the target (D-018). */
  categories: Category[];
  /** New rule version without the removed bottle (existing versions are untouched). */
  ruleVersion: BottleRuleVersion;
}

/**
 * BR-4 / D-018: remove (archive) a bottle.
 * - Non-zero balance requires a target → `bottle_transfer` (a negative balance is
 *   covered by a transfer from the target into the removed bottle).
 * - Categories defaulting to the removed bottle are repointed to the target, so a
 *   target is also required whenever any category uses the bottle.
 * - The current rule drops the bottle; remaining ratios stay as they are.
 */
export function removeBottle(input: {
  bottleId: Id;
  bottles: readonly Bottle[];
  /** Balance of the bottle in base currency minor units. */
  balance: BottleBalance;
  baseCurrency: CurrencyCode;
  targetBottleId?: Id;
  categories: readonly Category[];
  currentRule: BottleRuleVersion;
  newRuleId: Id;
  newTransferId: Id;
  today: IsoDate;
  now: IsoTimestamp;
}): RemoveBottleResult {
  const { bottleId, bottles, balance, targetBottleId } = input;
  const bottle = bottles.find((b) => b.id === bottleId && b.archivedAt === null);
  if (!bottle) throw new RangeError(`unknown or archived bottle: ${bottleId}`);
  if (balance.bottleId !== bottleId) throw new RangeError("balance is for a different bottle");
  if (!Number.isSafeInteger(balance.balanceMinor)) throw new RangeError("balance must be an integer");
  const active = bottles.filter((b) => b.archivedAt === null);
  if (active.length < 2) throw new RangeError("cannot remove the last bottle");

  const hasCategories = input.categories.some((c) => c.defaultBottleId === bottleId);
  if (targetBottleId === undefined && (balance.balanceMinor !== 0 || hasCategories)) {
    throw new RangeError("a target bottle is required (non-zero balance or categories use this bottle)");
  }
  if (targetBottleId !== undefined) {
    if (targetBottleId === bottleId) throw new RangeError("target must differ from the removed bottle");
    if (!active.some((b) => b.id === targetBottleId))
      throw new RangeError("unknown or archived target bottle");
  }

  let transfer: BottleTransfer | null = null;
  if (targetBottleId !== undefined && balance.balanceMinor !== 0) {
    const positive = balance.balanceMinor > 0;
    transfer = {
      id: input.newTransferId,
      fromBottleId: positive ? bottleId : targetBottleId,
      toBottleId: positive ? targetBottleId : bottleId,
      amountMinor: Math.abs(balance.balanceMinor),
      currency: input.baseCurrency,
      date: input.today,
      note: `Removed bottle "${bottle.name}"`,
    };
  }

  const categories = input.categories
    .filter((c) => c.defaultBottleId === bottleId)
    .map((c) => ({ ...c, defaultBottleId: targetBottleId ?? null }));

  const remaining = input.currentRule.ratios.filter((r) => r.bottleId !== bottleId);
  if (remaining.length === 0) throw new RangeError("rule would have no bottles");
  const ruleVersion: BottleRuleVersion = {
    id: input.newRuleId,
    effectiveFrom: input.now,
    note: `Removed bottle "${bottle.name}"`,
    ratios: remaining,
  };

  return { bottle: { ...bottle, archivedAt: input.now }, transfer, categories, ruleVersion };
}
