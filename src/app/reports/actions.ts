"use server";
import { redirect } from "next/navigation";
import { exportCsv } from "@/db/backup";

/** Write expenses.csv / incomes.csv under data/ (git-ignored) and report where they went. */
export async function exportCsvAction(): Promise<void> {
  let target: string;
  try {
    target = exportCsv().directory;
  } catch {
    redirect("/reports?export=error");
  }
  redirect(`/reports?export=${encodeURIComponent(target)}`);
}
