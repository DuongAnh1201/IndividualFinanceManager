"use server";
import { revalidatePath } from "next/cache";
import { dismissReminder, getPendingReminders } from "@/services/reminders";
import { withFinance } from "./_lib/finance";

/** Due, unresolved pay-day slots (missed ones included), oldest first. */
export async function loadPayDayReminders(): Promise<{ slots: string[] }> {
  try {
    return { slots: withFinance((deps) => getPendingReminders(deps)) };
  } catch {
    return { slots: [] }; // The banner is a nicety: never break a page because of it.
  }
}

export async function dismissPayDay(slot: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = withFinance((deps) => dismissReminder(deps, slot));
    if (!result.ok) return { ok: false, error: result.errors.map((e) => e.message).join(" ") };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch {
    return { ok: false, error: "We couldn’t dismiss that reminder. Please try again." };
  }
}
