/** In-memory Repositories for service tests (same contract as the db adapter, #15). */
import type {
  Bottle,
  BottleAllocation,
  BottleRuleVersion,
  BottleTransfer,
  Category,
  ExchangeRate,
  Expense,
  Income,
  LivingLimit,
  MonthlyReport,
  PaymentMethod,
  Reminder,
  Settings,
  Subscription,
} from "../../domain/types";
import type { Clock, Repositories, ServiceDeps } from "../ports";

export interface Store {
  settings: Settings;
  paymentMethods: PaymentMethod[];
  categories: Category[];
  bottles: Bottle[];
  ruleVersions: BottleRuleVersion[];
  expenses: Expense[];
  subscriptions: Subscription[];
  incomes: Income[];
  allocations: BottleAllocation[];
  transfers: BottleTransfer[];
  livingLimits: LivingLimit[];
  exchangeRates: ExchangeRate[];
  reminders: Reminder[];
  reports: Map<string, { report: MonthlyReport; generatedAt: string }>;
}

const upsertBy = <T>(rows: T[], row: T, same: (a: T) => boolean) => {
  const i = rows.findIndex(same);
  if (i >= 0) rows[i] = row;
  else rows.push(row);
};
const must = <T>(rows: T[], same: (a: T) => boolean, what: string): number => {
  const i = rows.findIndex(same);
  if (i < 0) throw new Error(`${what} not found`);
  return i;
};

export function seedStore(): Store {
  const bottleIds = ["N", "L", "F", "E", "P", "G"];
  const cat = (id: string, kind: Category["kind"], living: boolean, bottle: string): Category => ({
    id,
    name: id,
    kind,
    countsTowardLivingLimit: living,
    defaultBottleId: bottle,
    color: "#fff",
    mascot: "m",
    archivedAt: null,
  });
  return {
    settings: { baseCurrency: "USD", payDays: [10, 25], weekStartsOn: 1, timezone: "UTC" },
    paymentMethods: [{ id: "pm1", name: "Visa", type: "credit", last4: null, archivedAt: null }],
    categories: [
      cat("subs", "subscription", false, "N"),
      cat("food", "daily", true, "N"),
      cat("fun", "daily", true, "P"),
    ],
    bottles: bottleIds.map((id, i) => ({ id, name: id, mascot: "m", sortOrder: i, archivedAt: null })),
    ruleVersions: [
      {
        id: "v1",
        effectiveFrom: "1970-01-01T00:00:00.000Z",
        note: null,
        ratios: bottleIds.map((bottleId, i) => ({ bottleId, ratio: i === 0 ? 5 : 1 })),
      },
    ],
    expenses: [],
    subscriptions: [],
    incomes: [],
    allocations: [],
    transfers: [],
    livingLimits: [],
    exchangeRates: [],
    reminders: [],
    reports: new Map(),
  };
}

export function fakeRepos(store: Store): Repositories {
  const s = store;
  let depth = 0;
  return {
    settings: { get: () => s.settings },
    paymentMethods: { list: () => [...s.paymentMethods] },
    categories: {
      list: () => [...s.categories],
      update: (c) => void (s.categories[must(s.categories, (x) => x.id === c.id, "category")] = c),
    },
    bottles: {
      list: () => [...s.bottles],
      update: (b) => void (s.bottles[must(s.bottles, (x) => x.id === b.id, "bottle")] = b),
    },
    ruleVersions: { list: () => [...s.ruleVersions], insert: (v) => void s.ruleVersions.push(v) },
    expenses: {
      list: () => [...s.expenses],
      get: (id) => s.expenses.find((e) => e.id === id),
      insert: (e) => {
        if (
          e.subscriptionId &&
          s.expenses.some((x) => x.subscriptionId === e.subscriptionId && x.billingMonth === e.billingMonth)
        ) {
          throw new Error("duplicate subscription charge");
        }
        s.expenses.push(e);
      },
      insertMany(es) {
        const keyOf = (e: Expense) =>
          e.subscriptionId && e.billingMonth ? `${e.subscriptionId}|${e.billingMonth}` : null;
        const inserted: Expense[] = [];
        for (const e of es) {
          const key = keyOf(e);
          if (key && s.expenses.some((x) => keyOf(x) === key)) continue; // ON CONFLICT DO NOTHING
          s.expenses.push(e);
          inserted.push(e);
        }
        return inserted;
      },
      update: (e) => void (s.expenses[must(s.expenses, (x) => x.id === e.id, "expense")] = e),
      delete: (id) =>
        void s.expenses.splice(
          must(s.expenses, (x) => x.id === id, "expense"),
          1,
        ),
      postedChargeKeys: () =>
        new Set(
          s.expenses
            .filter((e) => e.subscriptionId && e.billingMonth)
            .map((e) => `${e.subscriptionId}|${e.billingMonth}`),
        ),
    },
    subscriptions: {
      list: () => [...s.subscriptions],
      get: (id) => s.subscriptions.find((x) => x.id === id),
      insert: (x) => void s.subscriptions.push(x),
      update: (x) => void (s.subscriptions[must(s.subscriptions, (y) => y.id === x.id, "subscription")] = x),
    },
    incomes: {
      list: () => [...s.incomes],
      get: (id) => s.incomes.find((x) => x.id === id),
      insert: (x) => void s.incomes.push(x),
      update: (x) => void (s.incomes[must(s.incomes, (y) => y.id === x.id, "income")] = x),
      delete: (id) =>
        void s.incomes.splice(
          must(s.incomes, (x) => x.id === id, "income"),
          1,
        ),
    },
    allocations: {
      list: () => [...s.allocations],
      insertMany: (rows) => void s.allocations.push(...rows),
      replaceForIncome(incomeId, rows) {
        s.allocations = s.allocations.filter((a) => a.incomeId !== incomeId).concat(rows);
      },
      deleteForIncome(incomeId) {
        s.allocations = s.allocations.filter((a) => a.incomeId !== incomeId);
      },
    },
    transfers: { list: () => [...s.transfers], insert: (t) => void s.transfers.push(t) },
    livingLimits: {
      list: () => [...s.livingLimits],
      get: (month) => s.livingLimits.find((l) => l.month === month),
      upsert: (l) => upsertBy(s.livingLimits, l, (x) => x.month === l.month),
    },
    exchangeRates: { list: () => [...s.exchangeRates] },
    reminders: {
      list: () => [...s.reminders],
      upsert: (r) => upsertBy(s.reminders, r, (x) => x.slot === r.slot),
      delete: (slot) => void (s.reminders = s.reminders.filter((r) => r.slot !== slot)),
    },
    monthlyReports: {
      months: () => [...s.reports.keys()].sort(),
      delete: (month) => void s.reports.delete(month),
      get: (month) => s.reports.get(month)?.report,
      upsert: (month, report, generatedAt) => void s.reports.set(month, { report, generatedAt }),
    },
    transaction<T>(fn: () => T): T {
      if (depth > 0) return fn();
      const snapshot = structuredClone(s);
      depth++;
      try {
        return fn();
      } catch (e) {
        Object.assign(s, snapshot);
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/** Deterministic clock: ids e1, e2, …; `today` and `now` are fixed per call to `fakeClock`. */
export function fakeClock(today = "2026-11-12", now = `${today}T10:00:00.000Z`): Clock {
  let n = 0;
  return { today: () => today, now: () => now, newId: () => `id${++n}` };
}

export function makeDeps(opts: { today?: string; now?: string } = {}): ServiceDeps & { store: Store } {
  const store = seedStore();
  return { store, repos: fakeRepos(store), clock: fakeClock(opts.today, opts.now) };
}
