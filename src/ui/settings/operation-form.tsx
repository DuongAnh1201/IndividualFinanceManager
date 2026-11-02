"use client";
import { useActionState, useId, useState } from "react";
import { FormError } from "@/ui/finance/form-parts";
import type { FormAction } from "@/ui/finance/types";
export interface InputSpec {
  name: string;
  label: string;
  type?: "text" | "number" | "month" | "date" | "checkbox";
  value?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  min?: string;
  max?: string;
  step?: string;
}
export function OperationForm({
  action,
  operation,
  id,
  fields = [],
  label = "Save",
  description,
  confirm,
}: {
  action: FormAction;
  operation: string;
  id?: string;
  fields?: InputSpec[];
  label?: string;
  description?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.value ?? ""])),
  );
  const prefix = useId();
  return (
    <form action={formAction} className="admin-form">
      <input type="hidden" name="operation" value={operation} />
      {id && <input type="hidden" name="id" value={id} />}
      <FormError state={state} />
      {description && <p className="muted">{description}</p>}
      <div className="form-grid">
        {fields.map((f) => {
          const elementId = `${prefix}-${f.name}`;
          const common = {
            id: elementId,
            name: f.name,
            required: f.required,
            "aria-invalid": state.fields?.[f.name] ? (true as const) : undefined,
            "aria-describedby": `${elementId}-hint`,
          };
          const change = (value: string) => setValues((v) => ({ ...v, [f.name]: value }));
          return (
            <label
              key={f.name}
              htmlFor={elementId}
              className={f.type === "checkbox" ? "check-label" : undefined}
            >
              {f.label}
              {f.options ? (
                <select {...common} value={values[f.name]} onChange={(e) => change(e.target.value)}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "checkbox" ? (
                <input
                  {...common}
                  type="checkbox"
                  checked={values[f.name] === "on"}
                  onChange={(e) => change(e.target.checked ? "on" : "")}
                />
              ) : (
                <input
                  {...common}
                  type={f.type ?? "text"}
                  value={values[f.name]}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  onChange={(e) => change(e.target.value)}
                />
              )}
              <small id={`${elementId}-hint`}>{state.fields?.[f.name] ?? f.hint}</small>
            </label>
          );
        })}
      </div>
      {confirm && (
        <label className="check-label">
          <input type="checkbox" name="confirm" required />
          {confirm}
        </label>
      )}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Saving…" : label}
        </button>
      </div>
      {state.success && <p role="status">{state.success}</p>}
    </form>
  );
}
