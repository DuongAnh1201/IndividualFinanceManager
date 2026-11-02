import type { Metadata } from "next";
import Link from "next/link";
import { addDays, parseDate, periodOf } from "@/domain/period";
import { withFinance, formOptions } from "@/app/_lib/finance";
import { deleteTransaction } from "@/app/actions";
import { TransactionFilterForm, type TransactionFilters } from "@/ui/finance/filters";
import { TransactionList } from "@/ui/finance/transaction-list";
import type { TransactionRow } from "@/ui/finance/types";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Transactions" };
export default async function Transactions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const text = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const { options, filters, rows, error } = withFinance((deps) => {
    const options = formOptions(deps);
    const month = periodOf("month", options.today);
    const useDefault = !Object.keys(query).some((k) =>
      ["start", "end", "all", "categoryId", "paymentMethodId", "bottleId", "kind"].includes(k),
    );
    const filters: TransactionFilters = {
      start: useDefault ? month.start : text("start"),
      end: useDefault ? addDays(month.end, -1) : text("end"),
      kind: text("kind"),
      categoryId: text("categoryId"),
      paymentMethodId: text("paymentMethodId"),
      bottleId: text("bottleId"),
    };
    try {
      if (filters.start) parseDate(filters.start);
      if (filters.end) parseDate(filters.end);
      if (filters.start && filters.end && filters.start > filters.end) throw new Error();
    } catch {
      return {
        options,
        filters,
        rows: [],
        error: "Choose valid dates, with the start on or before the end.",
      };
    }
    const range = {
      ...(filters.start ? { start: filters.start } : {}),
      ...(filters.end ? { end: addDays(filters.end, 1) } : {}),
    };
    const expenses =
      filters.kind === "income"
        ? []
        : deps.repos.expenses.list({
            ...range,
            ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
            ...(filters.paymentMethodId ? { paymentMethodId: filters.paymentMethodId } : {}),
            ...(filters.bottleId ? { bottleId: filters.bottleId } : {}),
          });
    const allocations = filters.bottleId
      ? deps.repos.allocations.list().filter((a) => a.bottleId === filters.bottleId && a.amountMinor > 0)
      : [];
    const incomes =
      filters.kind === "expense" || filters.categoryId || filters.paymentMethodId
        ? []
        : deps.repos.incomes
            .list()
            .filter(
              (i) =>
                (!range.start || i.date >= range.start) &&
                (!range.end || i.date < range.end) &&
                (!filters.bottleId || allocations.some((a) => a.incomeId === i.id)),
            );
    const rows: TransactionRow[] = [
      ...expenses.map((value) => ({ kind: "expense" as const, value })),
      ...incomes.map((value) => ({ kind: "income" as const, value })),
    ].sort((a, b) => b.value.date.localeCompare(a.value.date) || a.value.id.localeCompare(b.value.id));
    return { options, filters, rows, error: undefined };
  });
  const messages: Record<string, string> = {
    added: "Transaction saved. A little more clarity.",
    updated: "Changes saved.",
    deleted: "Transaction deleted.",
  };
  const message = messages[text("saved")];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">The little details, together</p>
          <h1>Transactions</h1>
          <p>Your expenses and income, one entry at a time.</p>
        </div>
        <Link href="/quick-add" className="button">
          ＋ Add transaction
        </Link>
      </div>
      {message && (
        <p className="success-notice" role="status">
          {message}
        </p>
      )}
      <TransactionFilterForm filters={filters} options={options} />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        <>
          <p className="muted results-count">
            {rows.length} {rows.length === 1 ? "transaction" : "transactions"} in this view
          </p>
          <TransactionList rows={rows} options={options} deleteAction={deleteTransaction} />
        </>
      )}
    </>
  );
}
