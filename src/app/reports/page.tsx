import type { Metadata } from "next";
import Link from "next/link";
import { incomeVsSpendRows, livingLimitRows, paymentSplit, stackedCategoryRows } from "@/domain/chartModels";
import { monthOf } from "@/domain/period";
import { getComparison, getMonthlyReport } from "@/services/reports";
import { EmptyState } from "@/ui/empty-state";
import { monthTitle } from "@/ui/format";
import { IncomeVsSpend, LivingLimitChart, PaymentDonut, StackedCategories } from "@/ui/reports/charts";
import { MonthlyReportView } from "@/ui/reports/monthly-report";
import { GRANULARITIES, parseGranularity, parseMonth, reportHref, shiftMonth } from "@/ui/reports/model";
import { withFinance } from "@/app/_lib/finance";
import { exportCsvAction } from "./actions";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports" };

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const granularity = parseGranularity(query.g);
  const exported = typeof query.export === "string" ? query.export : undefined;
  const data = withFinance((deps) => {
    const current = monthOf(deps.clock.today());
    const month = parseMonth(query.month, current);
    return {
      current,
      month,
      currency: deps.repos.settings.get().baseCurrency,
      series: getComparison(deps, granularity, 5),
      report: getMonthlyReport(deps, month),
      categories: deps.repos.categories.list(),
      bottles: deps.repos.bottles.list(),
      hasActivity: deps.repos.expenses.list().length + deps.repos.incomes.list().length > 0,
    };
  });
  const { month, current, currency, series, report } = data;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">See the shape of your money</p>
          <h1>Reports</h1>
          <p>The last five {granularity}s side by side, plus a closer look at one month.</p>
        </div>
      </div>
      <div className="report-controls">
        <nav aria-label="Compare by" className="segmented">
          {GRANULARITIES.map(({ id, label }) => (
            <Link
              key={id}
              href={reportHref(id, month)}
              aria-current={id === granularity ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Month for the summary" className="month-nav">
          <Link href={reportHref(granularity, shiftMonth(month, -1))} aria-label="Previous month">
            ←
          </Link>
          <strong>{monthTitle(month)}</strong>
          {month < current ? (
            <Link href={reportHref(granularity, shiftMonth(month, 1))} aria-label="Next month">
              →
            </Link>
          ) : (
            <span className="muted-text" aria-hidden="true">
              →
            </span>
          )}
        </nav>
      </div>
      {!data.hasActivity ? (
        <EmptyState
          title="Nothing to chart yet."
          description="Once you log some spending and income, your comparisons will appear here."
        />
      ) : (
        <>
          <div className="chart-grid">
            <StackedCategories chart={stackedCategoryRows(series, data.categories)} currency={currency} />
            <IncomeVsSpend rows={incomeVsSpendRows(series)} currency={currency} />
            <LivingLimitChart rows={livingLimitRows(series)} currency={currency} />
            <PaymentDonut slices={paymentSplit(report)} currency={currency} periodLabel={monthTitle(month)} />
          </div>
          <MonthlyReportView report={report} categories={data.categories} bottles={data.bottles} />
        </>
      )}
      <section className="card export-bar" aria-label="Export">
        <form action={exportCsvAction}>
          <button type="submit" className="button">
            Export CSV
          </button>
        </form>
        <p className="muted-text">Saves expenses.csv and incomes.csv to your data folder.</p>
        {exported === "error" && (
          <p className="form-error" role="alert">
            The export couldn’t be saved. Nothing was written.
          </p>
        )}
        {exported && exported !== "error" && (
          <p className="success-notice" role="status">
            Export saved to <code>{exported}</code>
          </p>
        )}
      </section>
    </>
  );
}
