"use client";
import { useActionState, useState } from "react";
import type { FormAction } from "./types";
import { FormError } from "./form-parts";
export function ConfirmAction({
  action,
  id,
  kind,
  label,
  explanation,
}: {
  action: FormAction;
  id: string;
  kind?: string;
  label: string;
  explanation: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  if (!confirming)
    return (
      <button type="button" className="quiet-button" onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  return (
    <form action={formAction} className="confirmation">
      <input type="hidden" name="id" value={id} />
      {kind && <input type="hidden" name="kind" value={kind} />}
      <p>{explanation}</p>
      <FormError state={state} />
      <div className="form-actions">
        <button type="submit" className="quiet-button danger-button" disabled={pending}>
          {pending ? "Working…" : `Confirm ${label.toLowerCase()}`}
        </button>
        <button
          type="button"
          className="quiet-button"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Keep it
        </button>
      </div>
    </form>
  );
}
