import type { Metadata } from "next";
import Link from "next/link";
import { getDashboard, getMonthlyReport } from "@/services/reports";
import { monthTitle } from "@/ui/format";
import { Penny } from "@/ui/mascots";
import {
  BottleBalances,
  CategoryBars,
  LivingLimitCard,
  PayDayBanner,
  SpendCard,
  UpcomingCharges,
} from "@/ui/dashboard/sections";
import { withFinance } from "./_lib/finance";
import { dismissPayDay } from "./dashboard-actions";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ payday?: string }> }) {
  const { payday } = await searchParams;
  const view = withFinance((deps) => {
    const dashboard = getDashboard(deps);
    return {
      dashboard,
      report: getMonthlyReport(deps, dashboard.month),
      currency: deps.repos.settings.get().baseCurrency,
      categories: deps.repos.categories.list(),
      bottles: deps.repos.bottles.list(),
      hasActivity: deps.repos.expenses.list().length + deps.repos.incomes.list().length > 0,
    };
  });
  const { dashboard, report, currency } = view;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{monthTitle(dashboard.month)}</p>
          <h1>Your cozy overview</h1>
          <p>A little clarity for today. A little room for tomorrow.</p>
        </div>
        <Link href="/quick-add" className="button">
          ＋ Quick add
        </Link>
      </div>
      {payday === "error" && (
        <p className="form-error" role="alert">
          That pay day couldn’t be dismissed. It may already be resolved.
        </p>
      )}
      <PayDayBanner slots={dashboard.pendingReminders} dismiss={dismissPayDay} />
      {!view.hasActivity ? (
        <section className="card welcome">
          <div>
            <p className="eyebrow">Hello from Penny</p>
            <h2>
              Let’s give your money
              <br />a happy little home.
            </h2>
            <p>Log your first expense or income and this page will fill with your month at a glance.</p>
            <Link href="/quick-add" className="button">
              Add your first entry <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="mascot-orbit">
            <Penny size={220} />
          </div>
        </section>
      ) : null}
      <div className="dash-grid">
        <LivingLimitCard
          status={dashboard.livingLimit}
          currency={currency}
          incompleteCount={dashboard.livingMissingRateExpenseIds.length}
          allowance={dashboard.allowance}
          warningPercent={dashboard.limitWarningPercent}
        />
        <SpendCard
          totalMinor={report.totalSpendMinor}
          deltaMinor={report.deltaVsPreviousMinor}
          currency={currency}
        />
        <CategoryBars rows={report.byCategory} categories={view.categories} currency={currency} />
        <UpcomingCharges items={dashboard.upcomingSubscriptions} />
      </div>
      <BottleBalances balances={dashboard.bottleBalances} bottles={view.bottles} currency={currency} />
    </>
  );
}
