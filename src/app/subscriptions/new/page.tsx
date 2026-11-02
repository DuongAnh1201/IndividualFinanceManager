import type { Metadata } from "next";
import { saveSubscription } from "@/app/actions";
import { withFinance, formOptions } from "@/app/_lib/finance";
import { SubscriptionForm } from "@/ui/finance/subscription-form";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add subscription" };
export default function NewSubscription() {
  const options = withFinance(formOptions);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Make room for the regulars</p>
          <h1>Add subscription</h1>
        </div>
      </div>
      <SubscriptionForm options={options} action={saveSubscription} />
    </>
  );
}
