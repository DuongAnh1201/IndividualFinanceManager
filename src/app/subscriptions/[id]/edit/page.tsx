import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveSubscription } from "@/app/actions";
import { withFinance, formOptions } from "@/app/_lib/finance";
import { SubscriptionForm } from "@/ui/finance/subscription-form";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit subscription" };
export default async function EditSubscription({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { options, existing } = withFinance((deps) => ({
    options: formOptions(deps),
    existing: deps.repos.subscriptions.get(id),
  }));
  if (!existing) notFound();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A little adjustment</p>
          <h1>Edit subscription</h1>
        </div>
      </div>
      <SubscriptionForm options={options} existing={existing} action={saveSubscription} />
    </>
  );
}
