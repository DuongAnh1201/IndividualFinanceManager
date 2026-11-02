import { monthOf } from "../domain/period";
import type { Id, IsoDate } from "../domain/types";
import type { Result } from "./result";
import type { Repositories, ServiceDeps } from "./ports";

class ServiceAbort extends Error {
  constructor(readonly result: Result<never>) {
    super("service use-case failed");
  }
}

/**
 * Run a use-case atomically. A failed Result rolls back EVERYTHING written so far:
 * the failure is thrown inside the transaction (so it rolls back) and turned back
 * into the failed Result outside it. Use-cases should still validate before writing.
 */
export function atomic<T>(deps: ServiceDeps, fn: () => Result<T>): Result<T> {
  try {
    return deps.repos.transaction(() => {
      const r = fn();
      if (!r.ok) throw new ServiceAbort(r);
      return r;
    });
  } catch (e) {
    if (e instanceof ServiceAbort) return e.result;
    throw e;
  }
}

/**
 * A write dated in (or before) a CLOSED month makes saved snapshots stale: that month's,
 * and every later closed month's too, since bottle balances accumulate. Delete them in
 * the same transaction; `snapshotClosedMonths` rebuilds them on the next open.
 */
export function invalidateSnapshotsFrom(
  { repos, clock }: ServiceDeps,
  dates: readonly (IsoDate | null | undefined)[],
): void {
  const months = dates.filter((d): d is IsoDate => !!d).map(monthOf);
  if (months.length === 0) return;
  const earliest = months.reduce((a, b) => (a < b ? a : b));
  const current = monthOf(clock.today());
  for (const m of repos.monthlyReports.months()) {
    if (m >= earliest && m < current) repos.monthlyReports.delete(m);
  }
}

/** A pay-day slot no longer resolved by any income goes back to pending (its stored "done" row is removed). */
export function reopenSlotIfOrphaned(repos: Repositories, slot: IsoDate | null, exceptIncomeId?: Id): void {
  if (!slot) return;
  if (repos.incomes.list().some((i) => i.payDaySlot === slot && i.id !== exceptIncomeId)) return;
  const row = repos.reminders.list().find((r) => r.slot === slot);
  if (row?.status === "done") repos.reminders.delete(slot);
}
