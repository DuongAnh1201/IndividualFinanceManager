import type { Metadata } from "next";
import Link from "next/link";
import { monthlyTotalsByCurrency, nextChargeDate } from "@/domain/subscriptions";
import { withFinance, formOptions } from "@/app/_lib/finance";
import { endSubscriptionAction } from "@/app/actions";
import { SubscriptionList } from "@/ui/finance/subscription-list";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscriptions" };
export default async function Subscriptions({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { options, rows, totals } = withFinance((deps) => {
    const options = formOptions(deps);
    const values = deps.repos.subscriptions.list();
    return {
      options,
      rows: values.map((value) => ({ value, nextCharge: nextChargeDate(value, options.today) })),
      totals: monthlyTotalsByCurrency(values, options.today),
    };
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A gentler kind of recurring</p>
          <h1>Subscriptions</h1>
          <p>Know what’s coming, and what you’re keeping.</p>
        </div>
        <Link href="/subscriptions/new" className="button">
          ＋ Add subscription
        </Link>
      </div>
      {saved && (
        <p className="success-notice" role="status">
          {saved === "ended"
            ? "Subscription ended today. Your past charges stay in your history."
            : "Subscription saved."}
        </p>
      )}
      <SubscriptionList rows={rows} totals={totals} options={options} removeAction={endSubscriptionAction} />
    </>
  );
}
