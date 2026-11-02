import { describe, expect, it } from "vitest";
import { activeRuleVersion, allocateIncome, splitIncome } from "./bottleSplit";
import type { BottleRuleVersion } from "./types";

const ids = ["N", "L", "F", "E", "P", "G"];
const default511111 = ids.map((bottleId, i) => ({ bottleId, ratio: i === 0 ? 5 : 1 }));
const sum = (xs: { amountMinor: number }[]) => xs.reduce((s, x) => s + x.amountMinor, 0);

describe("splitIncome (BR-3)", () => {
  it("splits evenly when divisible", () => {
    const s = splitIncome(1000_00, default511111);
    expect(s.map((x) => x.amountMinor)).toEqual([500_00, 100_00, 100_00, 100_00, 100_00, 100_00]);
  });

  it("gives the remainder to the first bottle and sums exactly", () => {
    const s = splitIncome(1003, default511111); // floor: 501,100,... remainder 3
    expect(s.map((x) => x.amountMinor)).toEqual([503, 100, 100, 100, 100, 100]);
    expect(sum(s)).toBe(1003);
  });

  it("works for VND-sized amounts without float drift", () => {
    const amt = 25_000_001;
    const s = splitIncome(amt, default511111);
    expect(sum(s)).toBe(amt);
    expect(s.slice(1).every((x) => x.amountMinor === Math.floor(amt / 10))).toBe(true);
  });

  it("handles tiny amounts (all remainder to first)", () => {
    const s = splitIncome(3, default511111);
    expect(s.map((x) => x.amountMinor)).toEqual([3, 0, 0, 0, 0, 0]);
  });

  it("single bottle gets everything", () => {
    expect(splitIncome(99, [{ bottleId: "N", ratio: 1 }])).toEqual([{ bottleId: "N", amountMinor: 99 }]);
  });

  it("is exact for many amounts", () => {
    for (let a = 1; a < 500; a++) expect(sum(splitIncome(a, default511111))).toBe(a);
  });

  it("rejects invalid input", () => {
    expect(() => splitIncome(0, default511111)).toThrow(RangeError);
    expect(() => splitIncome(10.5, default511111)).toThrow(RangeError);
    expect(() => splitIncome(10, [])).toThrow(RangeError);
    expect(() => splitIncome(10, [{ bottleId: "N", ratio: 0 }])).toThrow(RangeError);
    expect(() => splitIncome(10, [{ bottleId: "N", ratio: 1.5 }])).toThrow(RangeError);
    expect(() =>
      splitIncome(10, [
        { bottleId: "N", ratio: 1 },
        { bottleId: "N", ratio: 1 },
      ]),
    ).toThrow(RangeError);
  });
});

describe("allocateIncome", () => {
  it("builds allocations linked to the income", () => {
    let n = 0;
    const rule: BottleRuleVersion = {
      id: "v1",
      effectiveFrom: "2026-01-01T00:00:00Z",
      note: null,
      ratios: default511111,
    };
    const out = allocateIncome({ id: "inc1", amountMinor: 1003 }, rule, () => `a${++n}`);
    expect(out[0]).toEqual({ id: "a1", incomeId: "inc1", bottleId: "N", amountMinor: 503 });
    expect(out).toHaveLength(6);
  });
});

describe("activeRuleVersion", () => {
  const mk = (id: string, effectiveFrom: string): BottleRuleVersion => ({
    id,
    effectiveFrom,
    note: null,
    ratios: [],
  });
  const vs = [
    mk("a", "2026-01-01T00:00:00Z"),
    mk("c", "2026-06-01T00:00:00Z"),
    mk("b", "2026-03-01T00:00:00Z"),
  ];
  it("picks the latest version effective at the time", () => {
    expect(activeRuleVersion(vs, "2026-04-01T00:00:00Z")?.id).toBe("b");
    expect(activeRuleVersion(vs, "2026-06-01T00:00:00Z")?.id).toBe("c");
  });
  it("returns undefined before any version", () => {
    expect(activeRuleVersion(vs, "2025-01-01T00:00:00Z")).toBeUndefined();
  });
});
