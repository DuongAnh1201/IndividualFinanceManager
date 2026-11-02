"use client";
import { useActionState } from "react";
import { FormError } from "@/ui/finance/form-parts";
import type { FormAction, FormState } from "@/ui/finance/types";

function SimpleAction({
  action,
  label,
  description,
}: {
  action: () => Promise<FormState>;
  label: string;
  description: string;
}) {
  const [state, formAction, pending] = useActionState(async () => action(), {} as FormState);
  return (
    <form action={formAction} className="admin-form">
      <p className="muted">{description}</p>
      <FormError state={state} />
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Working…" : label}
        </button>
      </div>
      {state.success && <p role="status">{state.success}</p>}
    </form>
  );
}

export function BackupForms({
  createBackup,
  exportCsv,
  restore,
}: {
  createBackup: () => Promise<FormState>;
  exportCsv: () => Promise<FormState>;
  restore: FormAction;
}) {
  const [state, formAction, pending] = useActionState(restore, {});
  return (
    <>
      <SimpleAction
        action={createBackup}
        label="Create a backup"
        description="Saves a consistent copy of all your data on this computer. Keep it somewhere safe."
      />
      <SimpleAction
        action={exportCsv}
        label="Export CSV"
        description="Writes expenses.csv and incomes.csv for spreadsheets. Amounts are exact decimals."
      />
      <form action={formAction} className="admin-form">
        <h3>Restore from a backup</h3>
        <p className="muted">
          Restoring replaces <strong>all</strong> current data with the backup. Your current data is saved to
          a safety backup first, and the file is checked before anything is replaced.
        </p>
        <FormError state={state} />
        <label htmlFor="backup-file">
          Backup file
          <input
            id="backup-file"
            name="backup"
            type="file"
            accept=".db,.sqlite,.sqlite3,application/octet-stream"
            required
          />
        </label>
        <label className="check-label" htmlFor="restore-confirm">
          <input id="restore-confirm" name="confirm" type="checkbox" required />
          Yes, replace my current data with this backup
        </label>
        <div className="form-actions">
          <button type="submit" className="button danger-button" disabled={pending}>
            {pending ? "Restoring…" : "Restore backup"}
          </button>
        </div>
        {state.success && <p role="status">{state.success}</p>}
      </form>
    </>
  );
}
