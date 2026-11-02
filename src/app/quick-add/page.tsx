import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveTransaction } from "@/app/actions";
import { withFinance, formOptions } from "@/app/_lib/finance";
import { TransactionForm } from "@/ui/finance/transaction-form";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quick add" };
export default async function QuickAdd({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const slot = typeof query.payDaySlot === "string" ? query.payDaySlot : undefined;
  const kind = query.kind === "income" || slot ? "income" : "expense";
  const id = typeof query.id === "string" ? query.id : undefined;
  const { options, existing } = withFinance((deps) => ({
    options: formOptions(deps),
    existing: id ? (kind === "income" ? deps.repos.incomes.get(id) : deps.repos.expenses.get(id)) : undefined,
  }));
  if (id && !existing) notFound();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A small moment of clarity</p>
          <h1>{existing ? "Edit transaction" : "Quick add"}</h1>
          <p>{existing ? "Keep your history feeling right." : "Log it now. Let the little details rest."}</p>
        </div>
      </div>
      {!existing && (
        <nav aria-label="Transaction type" className="segmented">
          <Link href="/quick-add?kind=expense" aria-current={kind === "expense" ? "page" : undefined}>
            Expense
          </Link>
          <Link
            href={
              slot
                ? `/quick-add?kind=income&payDaySlot=${encodeURIComponent(slot)}`
                : "/quick-add?kind=income"
            }
            aria-current={kind === "income" ? "page" : undefined}
          >
            Income
          </Link>
        </nav>
      )}
      <TransactionForm
        key={`${kind}-${id ?? "new"}-${slot ?? ""}`}
        action={saveTransaction}
        options={options}
        kind={kind}
        existing={existing}
        payDaySlot={slot}
      />
    </>
  );
}
