import type { PennyMood } from "@/ui/mascots";
import type { LivingLimitStatus } from "@/domain/types";

/** Penny's mood follows the living-limit status; status text always accompanies it. */
export function moodFor(status: LivingLimitStatus | null): PennyMood {
  if (!status) return "happy";
  return status.status === "over" ? "dizzy" : status.status === "warning" ? "worried" : "happy";
}

export function statusMessage(status: LivingLimitStatus | null): { title: string; detail: string } {
  if (!status) {
    return {
      title: "No living limit yet",
      detail: "Set a monthly living limit to see how comfortably you’re doing.",
    };
  }
  if (status.status === "over")
    return { title: "Over your living limit", detail: "Let’s ease off the extras for now." };
  if (status.status === "warning")
    return { title: "Getting close", detail: "You’ve used most of this month’s living limit." };
  return { title: "Comfortably within your limit", detail: "Nice and steady. Keep it up!" };
}

/** Bar fill 0–100 for a progress ratio (over-limit fills the bar; 0-limit + spend counts as full). */
export function barPercent(ratio: number): number {
  if (!Number.isFinite(ratio)) return 100;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/** Whole-percent label, e.g. 0.834 → "83%"; Infinity → "over". */
export function percentLabel(ratio: number): string {
  return Number.isFinite(ratio) ? `${Math.round(ratio * 100)}%` : "over";
}

export interface ShareRow<T> {
  item: T;
  /** 0–100 share of the total, for bar width. */
  percent: number;
}

/** Shares of a total for bar widths; zero total → all 0. */
export function shares<T>(items: readonly T[], amount: (item: T) => number): ShareRow<T>[] {
  const total = items.reduce((sum, item) => sum + amount(item), 0);
  return items.map((item) => ({ item, percent: total > 0 ? Math.round((amount(item) / total) * 100) : 0 }));
}
