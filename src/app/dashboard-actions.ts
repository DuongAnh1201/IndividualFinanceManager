"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dismissReminder } from "@/services/reminders";
import { withFinance } from "./_lib/finance";

/** Dismiss a due pay-day slot from the banner; validation lives in the service. */
export async function dismissPayDay(data: FormData): Promise<void> {
  const slot = data.get("slot");
  if (typeof slot !== "string") redirect("/");
  let failed = false;
  try {
    failed = !withFinance((deps) => dismissReminder(deps, slot)).ok;
  } catch {
    failed = true;
  }
  revalidatePath("/");
  redirect(failed ? "/?payday=error" : "/");
}
