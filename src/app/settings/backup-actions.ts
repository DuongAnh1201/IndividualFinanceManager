"use server";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { backupDatabase, exportCsv, restoreDatabase } from "@/db/backup";
import type { FormState } from "@/ui/finance/types";

const busy = (error: unknown) =>
  error instanceof Error && error.name === "DatabaseBusyError"
    ? "Another backup or restore is in progress. Please try again in a moment."
    : undefined;

/** Writes a consistent copy of the database next to it (backups/); local files only, nothing is uploaded. */
export async function createBackupAction(): Promise<FormState> {
  try {
    const path = await backupDatabase();
    return { success: `Backup saved to ${path}` };
  } catch (error) {
    return { error: busy(error) ?? "We couldn’t create the backup. Nothing was changed." };
  }
}

export async function exportCsvAction(): Promise<FormState> {
  try {
    const result = exportCsv();
    return { success: `CSV files saved in ${result.directory} (expenses.csv, incomes.csv).` };
  } catch (error) {
    return { error: busy(error) ?? "We couldn’t export your data. Nothing was changed." };
  }
}

/**
 * Replaces the current data with an uploaded backup. Requires the explicit-replace checkbox; the
 * backup is validated first and a safety backup of the current data is written before anything is replaced.
 */
export async function restoreBackupAction(_state: FormState, data: FormData): Promise<FormState> {
  if (data.get("confirm") !== "on") {
    return {
      error: "Tick the box to confirm that your current data will be replaced.",
      fields: { confirm: "Required" },
    };
  }
  const file = data.get("backup");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a backup file to restore.", fields: { backup: "Choose a file" } };
  }
  const directory = mkdtempSync(join(tmpdir(), "ifm-upload-"));
  try {
    const upload = join(directory, "upload.db");
    writeFileSync(upload, Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
    const result = await restoreDatabase(upload);
    revalidatePath("/", "layout");
    return {
      success: `Restored. Your previous data was saved first at ${result.safetyBackupPath}`,
    };
  } catch (error) {
    return {
      error:
        busy(error) ??
        "That file isn’t a valid Cozy Coins backup, or it couldn’t be restored. Your current data was not changed.",
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
