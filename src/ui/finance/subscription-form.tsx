"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import type { CurrencyCode, Subscription } from "@/domain/types";
import { amountInputValue, Field, fieldA11y, FormError, useFormFields } from "./form-parts";
import type { FormAction, FormOptions } from "./types";
export function SubscriptionForm({
  action,
  options,
  existing,
}: {
  action: FormAction;
  options: FormOptions;
  existing?: Subscription;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [currency, setCurrency] = useState<CurrencyCode>(existing?.currency ?? options.baseCurrency);
  const bind = useFormFields({
    name: existing?.name ?? "",
    amount: existing ? amountInputValue(existing.amountMinor, existing.currency) : "",
    billingDay: String(existing?.billingDay ?? 1),
    startDate: existing?.startDate ?? options.today,
    categoryId:
      existing?.categoryId ??
      options.categories.find((c) => !c.archivedAt && c.kind === "subscription")?.id ??
      "",
    paymentMethodId: existing?.paymentMethodId ?? "",
  });
  return (
    <form className="card entry-form" action={formAction}>
      {existing && <input type="hidden" name="id" value={existing.id} />}
      <FormError state={state} />
      <div className="form-grid">
        <Field name="name" label="Subscription name" state={state}>
          <input
            id="name"
            name="name"
            required
            maxLength={200}
            autoFocus
            {...bind("name")}
            placeholder="Music, internet, a favorite app…"
            {...fieldA11y("name", state)}
          />
        </Field>
        <Field
          name="amount"
          label="Monthly amount"
          state={state}
          hint={currency === "VND" ? "Whole đồng; no decimals." : "Use a decimal point for cents."}
        >
          <input
            id="amount"
            name="amount"
            required
            inputMode={currency === "VND" ? "numeric" : "decimal"}
            {...bind("amount")}
            {...fieldA11y("amount", state, true)}
          />
        </Field>
        <Field name="currency" label="Currency" state={state}>
          <select
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          >
            <option value="USD">USD · US dollar</option>
            <option value="VND">VND · Vietnamese đồng</option>
          </select>
        </Field>
        <Field
          name="billingDay"
          label="Billing day of month"
          state={state}
          hint="Days 29–31 move to the last day in shorter months."
        >
          <input
            id="billingDay"
            name="billingDay"
            type="number"
            min="1"
            max="31"
            step="1"
            required
            {...bind("billingDay")}
            {...fieldA11y("billingDay", state, true)}
          />
        </Field>
        <Field name="startDate" label="Start date" state={state}>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            {...bind("startDate")}
            {...fieldA11y("startDate", state)}
          />
        </Field>
        <Field name="categoryId" label="Category" state={state}>
          <select
            id="categoryId"
            name="categoryId"
            required
            {...bind("categoryId")}
            {...fieldA11y("categoryId", state)}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {options.categories
              .filter((c) => !c.archivedAt || c.id === existing?.categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archivedAt ? " (archived)" : ""}
                </option>
              ))}
          </select>
        </Field>
        <Field name="paymentMethodId" label="Payment method" state={state}>
          <select
            id="paymentMethodId"
            name="paymentMethodId"
            required
            {...bind("paymentMethodId")}
            {...fieldA11y("paymentMethodId", state)}
          >
            <option value="" disabled>
              Choose a payment method
            </option>
            {options.paymentMethods
              .filter((p) => !p.archivedAt || p.id === existing?.paymentMethodId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archivedAt ? " (archived)" : ""}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <p className="muted">
        {existing
          ? "Updates apply to charges posted after this change. Previous transactions keep their amounts."
          : "Charges are added automatically when due, including missed months from the start date."}
      </p>
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Saving…" : existing ? "Save subscription" : "Add subscription"}
        </button>
        <Link href="/subscriptions" className="text-link">
          Cancel
        </Link>
      </div>
    </form>
  );
}
