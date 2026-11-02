"use client";
import { useState, type ChangeEvent, type ReactNode } from "react";
import { currencyExponent } from "@/domain/money";
import type { CurrencyCode } from "@/domain/types";
import type { FormState } from "./types";

/** Text formatting only: never round a stored integer or use grouped display text in inputs. */
export function amountInputValue(amountMinor: number, currency: CurrencyCode): string {
  const digits = currencyExponent(currency);
  const text = String(amountMinor).padStart(digits + 1, "0");
  return digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text;
}
export function Field({
  name,
  label,
  state,
  children,
  hint,
}: {
  name: string;
  label: string;
  state: FormState;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {children}
      {hint && (
        <small id={`${name}-hint`} className="muted">
          {hint}
        </small>
      )}
      {state.fields?.[name] && (
        <small id={`${name}-error`} className="field-error">
          {state.fields[name]}
        </small>
      )}
    </div>
  );
}
export function fieldA11y(name: string, state: FormState, hint = false) {
  return {
    "aria-invalid": state.fields?.[name] ? (true as const) : undefined,
    "aria-describedby":
      [hint ? `${name}-hint` : "", state.fields?.[name] ? `${name}-error` : ""].filter(Boolean).join(" ") ||
      undefined,
  };
}
export function FormError({ state }: { state: FormState }) {
  return state.error ? (
    <div className="form-error" role="alert">
      <strong>Let’s check that entry.</strong>
      <p>{state.error}</p>
    </div>
  ) : null;
}

/** Controlled fields keep typed values when a server action returns validation errors. */
export function useFormFields(initial: Record<string, string>) {
  const [values, setValues] = useState(initial);
  return (name: string) => ({
    value: values[name] ?? "",
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setValues((previous) => ({ ...previous, [name]: value }));
    },
  });
}
