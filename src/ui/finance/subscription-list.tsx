import Link from "next/link";
import { formatMoney } from "@/domain/money";
import type { Money, Subscription } from "@/domain/types";
import { Penny } from "@/ui/mascots";
import { ConfirmAction } from "./confirm-action";
import type { FormAction, FormOptions } from "./types";
export function SubscriptionList({
  rows,
  totals,
  options,
  removeAction,
}: {
  rows: { value: Subscription; nextCharge: string | null }[];
  totals: Money[];
  options: FormOptions;
  removeAction: FormAction;
}) {
  return (
    <>
      <section className="card summary-strip" aria-label="Monthly subscription cost">
        <div>
          <p className="eyebrow">Monthly commitment</p>
          {totals.length ? (
            totals.map((total) => (
              <span className="money" key={total.currency}>
                {formatMoney(total)}
              </span>
            ))
          ) : (
            <p>No active subscriptions</p>
          )}
          <p className="muted">
            Original currencies, shown separately. Ended subscriptions stay in your history.
          </p>
        </div>
      </section>
      {!rows.length ? (
        <section className="card empty-state">
          <Penny size={130} />
          <h2>A little less to keep track of.</h2>
          <p>Add a subscription and we’ll keep its charges together.</p>
          <Link className="button" href="/subscriptions/new">
            Add subscription
          </Link>
        </section>
      ) : (
        <ul className="subscription-list">
          {rows.map(({ value, nextCharge }) => (
            <li className="card subscription-card" key={value.id}>
              <div className="subscription-heading">
                <div>
                  <p className="eyebrow">
                    {value.endDate ? `Ended ${value.endDate}` : "Monthly subscription"}
                  </p>
                  <h2>{value.name}</h2>
                </div>
                <strong className="money">{formatMoney(value)} / month</strong>
              </div>
              <div className="subscription-meta">
                <span>{nextCharge ? `Next charge: ${nextCharge}` : "No future charges"}</span>
                <span>Billing day: {value.billingDay}</span>
                <span>
                  {options.paymentMethods.find((p) => p.id === value.paymentMethodId)?.name ??
                    "Payment method unavailable"}
                </span>
                <span>
                  {options.categories.find((c) => c.id === value.categoryId)?.name ?? "Category unavailable"}
                </span>
              </div>
              <div className="form-actions">
                {!value.endDate && (
                  <>
                    <Link href={`/subscriptions/${encodeURIComponent(value.id)}/edit`} className="text-link">
                      Edit<span className="sr-only"> {value.name}</span>
                    </Link>
                    <ConfirmAction
                      action={removeAction}
                      id={value.id}
                      label="Remove subscription"
                      explanation={`End ${value.name} today (${options.today})? A charge due today still counts. Posted expenses stay in your history.`}
                    />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
