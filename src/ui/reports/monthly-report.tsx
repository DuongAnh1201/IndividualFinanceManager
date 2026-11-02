import type { Bottle, Category, CurrencyCode, MonthlyReport } from "@/domain/types";
import { money, monthTitle, shortDate } from "@/ui/format";
import { barPercent, percentLabel, statusMessage } from "@/ui/dashboard/model";

const KIND_LABELS = { subscription: "Subscriptions", daily: "Everyday", other: "Other" } as const;
const TYPE_LABELS = { credit: "Credit", debit: "Debit", cash: "Cash" } as const;

export function MonthlyReportView({
  report,
  categories,
  bottles,
}: {
  report: MonthlyReport;
  categories: readonly Category[];
  bottles: readonly Bottle[];
}) {
  const currency: CurrencyCode = report.baseCurrency;
  const category = (id: string) => categories.find((c) => c.id === id)?.name ?? "Other";
  const bottle = (id: string) => bottles.find((b) => b.id === id)?.name ?? "Bottle";
  const incomplete = report.missingRateExpenseIds.length + report.missingRateIncomeIds.length;
  const limit = report.livingLimit;
  const delta = report.deltaVsPreviousMinor;
  return (
    <section className="card report-summary" aria-labelledby="monthly-heading">
      <p className="eyebrow">Monthly summary</p>
      <h2 id="monthly-heading">{monthTitle(report.month)}</h2>
      {incomplete > 0 && (
        <p className="badge badge-incomplete" role="note">
          Incomplete: {incomplete} {incomplete === 1 ? "transaction has" : "transactions have"} no exchange
          rate and {incomplete === 1 ? "isn’t" : "aren’t"} included in these totals.
        </p>
      )}
      <dl className="report-stats">
        <div>
          <dt>Total spending</dt>
          <dd className="money" data-testid="report-total">
            {money(report.totalSpendMinor, currency)}
          </dd>
        </div>
        <div>
          <dt>Income</dt>
          <dd className="money">{money(report.incomeTotalMinor, currency)}</dd>
        </div>
        <div>
          <dt>Compared with last month</dt>
          <dd>
            {delta === null
              ? "—"
              : delta === 0
                ? "No change"
                : `${money(Math.abs(delta), currency)} ${delta > 0 ? "more" : "less"}`}
          </dd>
        </div>
        <div>
          <dt>Living limit</dt>
          <dd>
            {limit ? `${percentLabel(limit.ratio)} used` : "No limit set"}
            {limit && (
              <span className="muted-text" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>
                {statusMessage(limit).title} · {money(limit.spentMinor, currency)} of{" "}
                {money(limit.limitMinor, currency)}
              </span>
            )}
          </dd>
        </div>
      </dl>
      {limit && (
        <div
          role="progressbar"
          aria-label="Living limit used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={barPercent(limit.ratio)}
          aria-valuetext={`${percentLabel(limit.ratio)} of the living limit used`}
          className={`meter meter-${limit.status}`}
        >
          <span style={{ width: `${barPercent(limit.ratio)}%` }} />
        </div>
      )}
      <div className="report-columns">
        <div>
          <h3>Subscriptions vs everyday</h3>
          <table className="report-table">
            <tbody>
              {(Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]).map((kind) => (
                <tr key={kind}>
                  <th scope="row">{KIND_LABELS[kind]}</th>
                  <td className="money">{money(report.byKind[kind], currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Credit, debit and cash</h3>
          <table className="report-table">
            <tbody>
              {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((type) => (
                <tr key={type}>
                  <th scope="row">{TYPE_LABELS[type]}</th>
                  <td className="money">{money(report.byPaymentType[type], currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>Bottles this month</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Bottle</th>
                <th scope="col">Added</th>
                <th scope="col">Balance</th>
              </tr>
            </thead>
            <tbody>
              {report.bottleBalances.map((b) => (
                <tr key={b.bottleId}>
                  <th scope="row">{bottle(b.bottleId)}</th>
                  <td className="money">
                    {money(
                      report.bottleAllocations.find((a) => a.bottleId === b.bottleId)?.totalMinor ?? 0,
                      currency,
                    )}
                  </td>
                  <td className="money">{money(b.balanceMinor, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Biggest expenses</h3>
          {report.topExpenses.length === 0 ? (
            <p className="muted-text">No expenses this month.</p>
          ) : (
            <table className="report-table">
              <tbody>
                {report.topExpenses.map((e) => (
                  <tr key={e.expenseId}>
                    <th scope="row">
                      {category(e.categoryId)}
                      <span className="muted-text"> · {shortDate(e.date)}</span>
                    </th>
                    <td className="money">{money(e.amountMinor, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
