import type { BottleAllocation, BottleRatio, BottleRuleVersion, Id, Income } from "./types";

export interface SplitShare {
  bottleId: Id;
  amountMinor: number;
}

/**
 * BR-3: share_i = floor(amount × ratio_i / Σ ratios); the remainder goes to the
 * first bottle so shares sum exactly to the amount. Works in the income's own
 * currency (minor units, integers only).
 *
 * D-016: `ratios` must be ordered by bottle `sortOrder`; the remainder goes to
 * `ratios[0]` (Necessities by default).
 */
export function splitIncome(amountMinor: number, ratios: readonly BottleRatio[]): SplitShare[] {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new RangeError("amountMinor must be a positive integer");
  }
  if (ratios.length === 0) throw new RangeError("at least one bottle ratio is required");
  if (ratios.some((r) => !Number.isInteger(r.ratio) || r.ratio <= 0)) {
    throw new RangeError("ratios must be positive integers");
  }
  if (new Set(ratios.map((r) => r.bottleId)).size !== ratios.length) {
    throw new RangeError("duplicate bottle in ratios");
  }
  const total = ratios.reduce((sum, r) => sum + r.ratio, 0);
  // BigInt avoids precision loss in amount × ratio.
  const shares = ratios.map((r) => ({
    bottleId: r.bottleId,
    amountMinor: Number((BigInt(amountMinor) * BigInt(r.ratio)) / BigInt(total)),
  }));
  const allocated = shares.reduce((sum, s) => sum + s.amountMinor, 0);
  const first = shares[0];
  if (first) first.amountMinor += amountMinor - allocated;
  return shares;
}

/** Split an income with a rule version; returns allocations (ids supplied by caller). */
export function allocateIncome(
  income: Pick<Income, "id" | "amountMinor">,
  rule: BottleRuleVersion,
  newId: () => Id,
): BottleAllocation[] {
  return splitIncome(income.amountMinor, rule.ratios).map((s) => ({
    id: newId(),
    incomeId: income.id,
    bottleId: s.bottleId,
    amountMinor: s.amountMinor,
  }));
}

/** The rule version active at `at` (latest effectiveFrom ≤ at), or undefined. */
export function activeRuleVersion(
  versions: readonly BottleRuleVersion[],
  at: string,
): BottleRuleVersion | undefined {
  return versions
    .filter((v) => v.effectiveFrom <= at)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
}
