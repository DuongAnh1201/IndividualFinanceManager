import { bottleBalances } from "../domain/bottleBalances";
import { livingLimitStatusFor, livingSpent } from "../domain/livingLimit";
import { addDays, monthOf, periodOf } from "../domain/period";
import { pendingReminders } from "../domain/reminders";
import {
  buildComparisonSeries,
  buildMonthlyReport,
  monthsNeedingSnapshot,
  type ReportData,
} from "../domain/report";
import { activeSubscriptions, nextChargeDate } from "../domain/subscriptions";
import type {
  BottleBalance,
  ComparisonSeries,
  Granularity,
  Id,
  IsoDate,
  IsoMonth,
  LivingLimitStatus,
  MonthlyReport,
  Subscription,
} from "../domain/types";
import type { ServiceDeps } from "./ports";
import { getReminderStart } from "./reminders";

/**
 * Load everything the report builders need. Bottle balances are derived from rows dated
 * before `balancesBefore` (exclusive) — pass a period's end to get month-end balances;
 * omit for balances as of now.
 */
function loadReportData({ repos }: ServiceDeps, balancesBefore?: IsoDate): { data: ReportData } {
  const settings = repos.settings.get();
  const incomes = repos.incomes.list();
  const allocations = repos.allocations.list();
  const expenses = repos.expenses.list();
  const exchangeRates = repos.exchangeRates.list();
  const before = <T extends { date: IsoDate }>(rows: T[]) =>
    balancesBefore === undefined ? rows : rows.filter((r) => r.date < balancesBefore);
  const result = bottleBalances(
    repos.bottles.list(),
    allocations,
    before(incomes),
    before(repos.transfers.list()),
    before(expenses),
    settings.baseCurrency,
    exchangeRates,
  );
  return {
    data: {
      baseCurrency: settings.baseCurrency,
      expenses,
      incomes,
      allocations,
      categories: repos.categories.list(),
      paymentMethods: repos.paymentMethods.list(),
      exchangeRates,
      livingLimits: repos.livingLimits.list(),
      bottleBalances: result.balances,
    },
  };
}

/** First day after `month` (exclusive upper bound for month-end balances). */
const monthEnd = (month: IsoMonth): IsoDate => periodOf("month", `${month}-01`).end;

/** BR-7: a closed month returns its saved snapshot when present; otherwise computed live. */
export function getMonthlyReport(deps: ServiceDeps, month: IsoMonth, today?: IsoDate): MonthlyReport {
  const { repos, clock } = deps;
  if (monthOf(today ?? clock.today()) > month) {
    const snap = repos.monthlyReports.get(month);
    if (snap) return snap;
  }
  return buildMonthlyReport(month, loadReportData(deps, monthEnd(month)).data);
}

export function getComparison(
  deps: ServiceDeps,
  granularity: Granularity,
  n = 5,
  today?: IsoDate,
): ComparisonSeries {
  const { repos, clock } = deps;
  return buildComparisonSeries(
    granularity,
    n,
    today ?? clock.today(),
    repos.settings.get().weekStartsOn,
    loadReportData(deps).data,
  );
}

/**
 * BR-7: save a snapshot for every ended month that lacks one (catch-up after absence),
 * oldest first. Returns the months written.
 */
export function snapshotClosedMonths(deps: ServiceDeps, today?: IsoDate): IsoMonth[] {
  const { repos, clock } = deps;
  const now = clock.now();
  const t = today ?? clock.today();
  return repos.transaction(() => {
    const { data } = loadReportData(deps);
    const months = [...data.expenses.map((e) => e.date), ...data.incomes.map((i) => i.date)]
      .map(monthOf)
      .sort();
    const first = months[0];
    if (!first) return [];
    const due = monthsNeedingSnapshot(first, t, repos.monthlyReports.months());
    for (const m of due) {
      // Past months use month-end bottle balances, not today's.
      const monthData = loadReportData(deps, monthEnd(m)).data;
      repos.monthlyReports.upsert(m, buildMonthlyReport(m, monthData), now);
    }
    return due;
  });
}

export interface UpcomingSubscription {
  subscription: Subscription;
  nextChargeDate: IsoDate;
}

export interface Dashboard {
  month: IsoMonth;
  livingLimit: LivingLimitStatus | null;
  /** Counted expenses lacking an FX rate; excluded from the living total (BR-8). */
  livingMissingRateExpenseIds: Id[];
  bottleBalances: BottleBalance[];
  pendingReminders: IsoDate[];
  /** Active subscriptions by next charge date; those charging within `upcomingDays`. */
  upcomingSubscriptions: UpcomingSubscription[];
}

export function getDashboard(deps: ServiceDeps, today?: IsoDate, upcomingDays = 14): Dashboard {
  const { repos, clock } = deps;
  const t = today ?? clock.today();
  const month = monthOf(t);
  const { data } = loadReportData(deps);
  const spent = livingSpent(data.expenses, data.categories, month, data.baseCurrency, data.exchangeRates);
  const horizon = addDays(t, upcomingDays);
  const upcoming = activeSubscriptions(repos.subscriptions.list(), t)
    .map((subscription) => ({ subscription, next: nextChargeDate(subscription, t) }))
    .filter((x): x is { subscription: Subscription; next: IsoDate } => x.next !== null && x.next <= horizon)
    .sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : 0))
    .map((x) => ({ subscription: x.subscription, nextChargeDate: x.next }));
  return {
    month,
    livingLimit: livingLimitStatusFor(month, data.livingLimits, spent.spentMinor),
    livingMissingRateExpenseIds: spent.missingRateExpenseIds,
    bottleBalances: [...data.bottleBalances],
    pendingReminders: pendingReminders({
      payDays: repos.settings.get().payDays,
      today: t,
      since: getReminderStart(deps, t),
      incomes: data.incomes,
      stored: repos.reminders.list(),
    }),
    upcomingSubscriptions: upcoming,
  };
}
