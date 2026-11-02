import Link from "next/link";
import type { FormOptions } from "./types";
export type TransactionFilters = {
  start: string;
  end: string;
  kind: string;
  categoryId: string;
  paymentMethodId: string;
  bottleId: string;
};
export function TransactionFilterForm({
  filters,
  options,
}: {
  filters: TransactionFilters;
  options: FormOptions;
}) {
  return (
    <form className="card filter-form" action="/transactions">
      <fieldset>
        <legend>Find a transaction</legend>
        <div className="filter-grid">
          <label>
            From
            <input name="start" type="date" defaultValue={filters.start} />
          </label>
          <label>
            Through
            <input name="end" type="date" defaultValue={filters.end} />
          </label>
          <label>
            Type
            <select name="kind" defaultValue={filters.kind}>
              <option value="">Expense & income</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Category
            <select name="categoryId" defaultValue={filters.categoryId}>
              <option value="">All categories</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archivedAt ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment method
            <select name="paymentMethodId" defaultValue={filters.paymentMethodId}>
              <option value="">All payment methods</option>
              {options.paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archivedAt ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bottle
            <select name="bottleId" defaultValue={filters.bottleId}>
              <option value="">All bottles</option>
              {options.bottles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.archivedAt ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          Category and payment method filters apply to expenses. A bottle filter also matches income allocated
          to that bottle.
        </p>
        <div className="form-actions">
          <button className="button" type="submit">
            Apply filters
          </button>
          <Link href="/transactions?all=1" className="text-link">
            Show all
          </Link>
        </div>
      </fieldset>
    </form>
  );
}
