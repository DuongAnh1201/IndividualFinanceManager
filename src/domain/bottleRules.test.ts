import { describe, expect, it } from "vitest";
import {
  createRuleVersion,
  orderRatios,
  ratioPercentages,
  removeBottle,
  renameBottle,
  resplitIncome,
  validateRatios,
} from "./bottleRules";
import type { Bottle, BottleRuleVersion, Category, Income } from "./types";

const bottle = (id: string, sortOrder: number, archivedAt: string | null = null): Bottle => ({
  id,
  name: id,
  mascot: "m",
  sortOrder,
  archivedAt,
});
const bottles = [bottle("N", 0), bottle("L", 1), bottle("P", 2)];
const cat = (id: string, defaultBottleId: string | null): Category => ({
  id,
  name: id,
  kind: "daily",
  countsTowardLivingLimit: true,
  defaultBottleId,
  color: "#fff",
  mascot: "m",
  archivedAt: null,
});
const rule: BottleRuleVersion = {
  id: "v1",
  effectiveFrom: "2026-01-01T00:00:00Z",
  note: null,
  ratios: [
    { bottleId: "N", ratio: 5 },
    { bottleId: "L", ratio: 1 },
    { bottleId: "P", ratio: 1 },
  ],
};

describe("ratios", () => {
  it("validates", () => {
    expect(() => validateRatios([])).toThrow(RangeError);
    expect(() => validateRatios([{ bottleId: "N", ratio: 0 }])).toThrow(RangeError);
    expect(() => validateRatios([{ bottleId: "N", ratio: 1.2 }])).toThrow(RangeError);
    expect(() => validateRatios(rule.ratios)).not.toThrow();
  });

  it("computes live percentages", () => {
    const p = ratioPercentages(rule.ratios);
    expect(p[0]?.percent).toBeCloseTo(71.43, 1);
    expect(p.reduce((s, x) => s + x.percent, 0)).toBeCloseTo(100);
  });

  it("orders by bottle sortOrder and rejects unknown bottles", () => {
    const shuffled = [rule.ratios[2]!, rule.ratios[0]!, rule.ratios[1]!];
    expect(orderRatios(shuffled, bottles).map((r) => r.bottleId)).toEqual(["N", "L", "P"]);
    expect(() => orderRatios([{ bottleId: "X", ratio: 1 }], bottles)).toThrow(RangeError);
  });
});

describe("createRuleVersion (BR-4)", () => {
  it("creates a new version without touching the old one", () => {
    const before = JSON.stringify(rule);
    const v2 = createRuleVersion({
      id: "v2",
      effectiveFrom: "2026-06-01T00:00:00Z",
      ratios: [
        { bottleId: "P", ratio: 2 },
        { bottleId: "N", ratio: 3 },
      ],
      bottles,
    });
    expect(v2.id).toBe("v2");
    expect(v2.note).toBeNull();
    expect(v2.ratios.map((r) => r.bottleId)).toEqual(["N", "P"]);
    expect(JSON.stringify(rule)).toBe(before);
  });

  it("rejects invalid ratios", () => {
    expect(() =>
      createRuleVersion({ id: "v", effectiveFrom: "x", ratios: [{ bottleId: "N", ratio: -1 }], bottles }),
    ).toThrow(RangeError);
  });
});

describe("renameBottle", () => {
  it("trims and rejects empty", () => {
    expect(renameBottle(bottles[0]!, "  Needs ").name).toBe("Needs");
    expect(() => renameBottle(bottles[0]!, "  ")).toThrow(RangeError);
  });
});

describe("resplitIncome", () => {
  it("re-splits with the new rule and relinks the income", () => {
    const income: Income = {
      id: "i1",
      date: "2026-01-10",
      amountMinor: 700,
      currency: "USD",
      fxRateToBase: null,
      source: "Salary",
      note: null,
      payDaySlot: null,
      bottleRuleVersionId: "old",
    };
    let n = 0;
    const out = resplitIncome(income, rule, () => `a${++n}`);
    expect(out.income.bottleRuleVersionId).toBe("v1");
    expect(out.allocations.map((a) => a.amountMinor)).toEqual([500, 100, 100]);
    expect(income.bottleRuleVersionId).toBe("old");
  });
});

describe("removeBottle (BR-4, D-018)", () => {
  const base = {
    bottles,
    baseCurrency: "USD" as const,
    categories: [cat("c1", "P"), cat("c2", "N"), cat("c3", "P")],
    currentRule: rule,
    newRuleId: "v2",
    newTransferId: "t1",
    today: "2026-06-01",
    now: "2026-06-01T10:00:00Z",
  };

  it("moves a positive balance to the target and repoints categories", () => {
    const r = removeBottle({
      ...base,
      bottleId: "P",
      balance: { bottleId: "P", balanceMinor: 1234 },
      targetBottleId: "N",
    });
    expect(r.transfer).toMatchObject({
      fromBottleId: "P",
      toBottleId: "N",
      amountMinor: 1234,
      currency: "USD",
      date: "2026-06-01",
    });
    expect(r.categories.map((c) => [c.id, c.defaultBottleId])).toEqual([
      ["c1", "N"],
      ["c3", "N"],
    ]);
    expect(r.bottle.archivedAt).toBe("2026-06-01T10:00:00Z");
    expect(r.ruleVersion.ratios.map((x) => x.bottleId)).toEqual(["N", "L"]);
    expect(rule.ratios).toHaveLength(3);
  });

  it("covers a negative balance from the target", () => {
    const r = removeBottle({
      ...base,
      bottleId: "P",
      balance: { bottleId: "P", balanceMinor: -50 },
      targetBottleId: "L",
    });
    expect(r.transfer).toMatchObject({ fromBottleId: "L", toBottleId: "P", amountMinor: 50 });
  });

  it("needs no target when balance is zero and no category uses it", () => {
    const r = removeBottle({ ...base, bottleId: "L", balance: { bottleId: "L", balanceMinor: 0 } });
    expect(r.transfer).toBeNull();
    expect(r.categories).toEqual([]);
  });

  it("requires a target for balance or categories", () => {
    expect(() =>
      removeBottle({ ...base, bottleId: "L", balance: { bottleId: "L", balanceMinor: 5 } }),
    ).toThrow(RangeError);
    expect(() =>
      removeBottle({ ...base, bottleId: "P", balance: { bottleId: "P", balanceMinor: 0 } }),
    ).toThrow(RangeError);
  });

  it("rejects bad targets, bad bottles and removing the last bottle", () => {
    const bal = { bottleId: "P", balanceMinor: 1 };
    expect(() => removeBottle({ ...base, bottleId: "P", balance: bal, targetBottleId: "P" })).toThrow(
      RangeError,
    );
    expect(() => removeBottle({ ...base, bottleId: "P", balance: bal, targetBottleId: "X" })).toThrow(
      RangeError,
    );
    expect(() => removeBottle({ ...base, bottleId: "X", balance: bal, targetBottleId: "N" })).toThrow(
      RangeError,
    );
    expect(() =>
      removeBottle({
        ...base,
        bottleId: "P",
        balance: { bottleId: "N", balanceMinor: 1 },
        targetBottleId: "N",
      }),
    ).toThrow(RangeError);
    expect(() =>
      removeBottle({ ...base, bottles: [bottle("P", 0)], bottleId: "P", balance: bal, targetBottleId: "N" }),
    ).toThrow(RangeError);
    expect(() =>
      removeBottle({
        ...base,
        bottles: [...bottles.slice(0, 2), bottle("P", 2, "2026-01-01T00:00:00Z")],
        bottleId: "N",
        balance: { bottleId: "N", balanceMinor: 1 },
        targetBottleId: "P",
      }),
    ).toThrow(RangeError);
  });
});
