"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { currencyExponent } from "@/domain/money";
import type { CurrencyCode, Expense, Income } from "@/domain/types";
import { amountInputValue, Field, fieldA11y, FormError, useFormFields } from "./form-parts";
import type { FormAction, FormOptions } from "./types";

export function TransactionForm({
  action,
  options,
  kind,
  existing,
  payDaySlot,
}: {
  action: FormAction;
  options: FormOptions;
  kind: "expense" | "income";
  existing?: Expense | Income;
  payDaySlot?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [currency, setCurrency] = useState<CurrencyCode>(existing?.currency ?? options.baseCurrency);
  const expense = existing && "categoryId" in existing ? existing : undefined;
  const income = existing && "bottleRuleVersionId" in existing ? existing : undefined;
  const slot = payDaySlot ?? income?.payDaySlot ?? "";
  const bind = useFormFields({
    amount: existing ? amountInputValue(existing.amountMinor, existing.currency) : "",
    date: existing?.date ?? options.today,
    source: income?.source ?? "",
    categoryId: expense?.categoryId ?? "",
    paymentMethodId: expense?.paymentMethodId ?? "",
    bottleId: expense?.bottleId ?? "",
    fxRateToBase: String(existing?.fxRateToBase ?? ""),
    note: existing?.note ?? "",
  });
  return (
    <form action={formAction} className="card entry-form">
      <input type="hidden" name="kind" value={kind} />
      {existing && <input type="hidden" name="id" value={existing.id} />}
      {kind === "income" && <input type="hidden" name="payDaySlot" value={slot} />}
      <FormError state={state} />
      {kind === "income" && slot && (
        <div className="inline-notice">
          This income will resolve the <strong>{slot}</strong> payday reminder, even if it arrived early.
        </div>
      )}
      {expense?.source === "subscription" && (
        <div className="inline-notice">
          You’re editing a posted charge. Changes here affect this transaction; the subscription’s future
          price stays the same.
        </div>
      )}
      <div className="form-grid">
        <Field
          name="amount"
          label="Amount"
          state={state}
          hint={
            currency === "VND" ? "Whole đồng; no decimal places." : "Dollars and cents; use a decimal point."
          }
        >
          <input
            id="amount"
            name="amount"
            inputMode={currency === "VND" ? "numeric" : "decimal"}
            required
            autoFocus
            {...bind("amount")}
            placeholder={currency === "VND" ? "50000" : "0.00"}
            {...fieldA11y("amount", state, true)}
          />
        </Field>
        <Field name="currency" label="Currency" state={state}>
          <select
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            {...fieldA11y("currency", state)}
          >
            <option value="USD">USD · US dollar</option>
            <option value="VND">VND · Vietnamese đồng</option>
          </select>
        </Field>
        <Field name="date" label="Date" state={state}>
          <input id="date" name="date" type="date" required {...bind("date")} {...fieldA11y("date", state)} />
        </Field>
        {kind === "income" ? (
          <Field name="source" label="Income source" state={state}>
            <input
              id="source"
              name="source"
              required
              maxLength={200}
              {...bind("source")}
              placeholder="Salary, freelance work…"
              {...fieldA11y("source", state)}
            />
          </Field>
        ) : (
          <>
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
                  .filter((c) => !c.archivedAt || c.id === expense?.categoryId)
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
                  Choose how you paid
                </option>
                {options.paymentMethods
                  .filter((p) => !p.archivedAt || p.id === expense?.paymentMethodId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.archivedAt ? " (archived)" : ""}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              name="bottleId"
              label="Bottle"
              state={state}
              hint="Use the category’s default or choose a bottle."
            >
              <select
                id="bottleId"
                name="bottleId"
                {...bind("bottleId")}
                {...fieldA11y("bottleId", state, true)}
              >
                <option value="">Category default</option>
                {options.bottles
                  .filter((b) => !b.archivedAt || b.id === expense?.bottleId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.archivedAt ? " (archived)" : ""}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
        {currency !== options.baseCurrency && (
          <Field
            name="fxRateToBase"
            label={`Exchange rate to ${options.baseCurrency}`}
            state={state}
            hint={`1 ${currency} = this many ${options.baseCurrency}. Leave blank to use the saved monthly rate.`}
          >
            <input
              id="fxRateToBase"
              name="fxRateToBase"
              inputMode="decimal"
              {...bind("fxRateToBase")}
              placeholder="e.g. 0.00004"
              {...fieldA11y("fxRateToBase", state, true)}
            />
          </Field>
        )}
      </div>
      <Field name="note" label="Note (optional)" state={state}>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={2000}
          {...bind("note")}
          placeholder="Anything you’d like to remember"
          {...fieldA11y("note", state)}
        />
      </Field>
      {kind === "income" && (
        <p className="muted">
          {existing
            ? "This edit keeps the income’s original bottle rule version and updates its allocations."
            : "Income is split into bottles using your active rules."}
        </p>
      )}
      <div className="form-actions">
        <button className="button" disabled={pending} type="submit">
          {pending ? "Saving…" : existing ? "Save changes" : `Save ${kind}`}
        </button>
        <Link href="/transactions" className="text-link">
          Cancel
        </Link>
        <span role="status" className="sr-only">
          {pending ? "Saving your transaction" : ""}
        </span>
      </div>
      <span className="sr-only">
        {currencyExponent(currency)} decimal places for {currency}
      </span>
    </form>
  );
}
