import Link from "next/link";
import { formatMoney } from "@/domain/money";
import { Penny } from "@/ui/mascots";
import { ConfirmAction } from "./confirm-action";
import type { FormAction, FormOptions, TransactionRow } from "./types";
export function TransactionList({
  rows,
  options,
  deleteAction,
}: {
  rows: TransactionRow[];
  options: FormOptions;
  deleteAction: FormAction;
}) {
  if (!rows.length)
    return (
      <section className="card empty-state">
        <Penny size={130} />
        <h2>No transactions in this view.</h2>
        <p>Add an entry or adjust the filters to find what you’re looking for.</p>
        <Link className="button" href="/quick-add">
          Add a transaction
        </Link>
      </section>
    );
  return (
    <ul className="transaction-list">
      {rows.map(({ kind, value }) => {
        const category =
          "categoryId" in value ? options.categories.find((c) => c.id === value.categoryId) : undefined;
        const method =
          "paymentMethodId" in value
            ? options.paymentMethods.find((p) => p.id === value.paymentMethodId)
            : undefined;
        const bottle = "bottleId" in value ? options.bottles.find((b) => b.id === value.bottleId) : undefined;
        const title = kind === "income" && "source" in value ? value.source : (category?.name ?? "Expense");
        return (
          <li key={`${kind}-${value.id}`} className="card transaction-row">
            <div className="transaction-details">
              <div className="row-heading">
                <span className="pill">{kind === "income" ? "Income" : "Expense"}</span>
                <time dateTime={value.date}>{value.date}</time>
              </div>
              <h2>{title}</h2>
              <p className="muted">
                {kind === "income"
                  ? "Allocated to your bottles"
                  : [method?.name, bottle?.name].filter(Boolean).join(" · ")}
                {"source" in value && value.source === "subscription" && kind === "expense"
                  ? " · Subscription charge"
                  : ""}
              </p>
              {value.note && <p className="transaction-note">{value.note}</p>}
            </div>
            <div className="transaction-value">
              <strong className="money">
                {kind === "income" ? "+" : "−"}
                {formatMoney(value)}
              </strong>
              <Link className="text-link" href={`/quick-add?kind=${kind}&id=${encodeURIComponent(value.id)}`}>
                Edit
                <span className="sr-only">
                  {" "}
                  {title} on {value.date}
                </span>
              </Link>
              {kind === "expense" && "source" in value && value.source === "subscription" ? (
                <Link className="text-link" href="/subscriptions">
                  Manage subscription
                </Link>
              ) : (
                <ConfirmAction
                  action={deleteAction}
                  id={value.id}
                  kind={kind}
                  label="Delete"
                  explanation={
                    kind === "income"
                      ? "Delete this income and its bottle allocations?"
                      : "Delete this expense? This cannot be undone."
                  }
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
