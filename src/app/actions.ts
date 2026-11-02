"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addExpense,
  editExpense,
  addIncome,
  updateIncome,
  deleteExpense,
  deleteIncome,
} from "@/services/transactions";
import {
  createSubscription,
  updateSubscription,
  removeSubscription,
  runSubscriptionAutopost,
} from "@/services/subscriptions";
import type { FormState } from "@/ui/finance/types";
import { withFinance } from "./_lib/finance";
import { formFailure, readMoney, text, transactionInput } from "./_lib/form-data";

function refreshFinance() {
  for (const path of ["/", "/transactions", "/subscriptions", "/bottles", "/reports"]) revalidatePath(path);
}
const storageError = (): FormState => ({
  error: "We couldn’t save that change. Your entry is still here; please try again.",
});

export async function saveTransaction(_previous: FormState, data: FormData): Promise<FormState> {
  const kind = text(data, "kind");
  if (kind !== "expense" && kind !== "income") return { error: "Choose expense or income." };
  const parsed = transactionInput(data);
  if (!parsed.ok) return parsed.state;
  const id = text(data, "id");
  let state: FormState | undefined;
  try {
    state = withFinance((deps) => {
      if (kind === "income") {
        const input = {
          ...parsed.value,
          source: text(data, "source"),
          payDaySlot: text(data, "payDaySlot") || null,
        };
        const result = id ? updateIncome(deps, id, input) : addIncome(deps, input);
        return result.ok ? undefined : formFailure(result.errors);
      }
      const input = {
        ...parsed.value,
        categoryId: text(data, "categoryId"),
        paymentMethodId: text(data, "paymentMethodId"),
        bottleId: text(data, "bottleId") || null,
      };
      const result = id ? editExpense(deps, id, input) : addExpense(deps, input);
      return result.ok ? undefined : formFailure(result.errors);
    });
  } catch {
    return storageError();
  }
  if (state) return state;
  refreshFinance();
  redirect(`/transactions?saved=${id ? "updated" : "added"}`);
}
export async function deleteTransaction(_previous: FormState, data: FormData): Promise<FormState> {
  const kind = text(data, "kind");
  if (kind !== "expense" && kind !== "income") return { error: "Unknown transaction type." };
  let state: FormState | undefined;
  try {
    state = withFinance((deps) => {
      const result =
        kind === "income" ? deleteIncome(deps, text(data, "id")) : deleteExpense(deps, text(data, "id"));
      return result.ok ? undefined : formFailure(result.errors);
    });
  } catch {
    return { error: "We couldn’t delete that entry. Please try again." };
  }
  if (state) return state;
  refreshFinance();
  redirect("/transactions?saved=deleted");
}
export async function saveSubscription(_previous: FormState, data: FormData): Promise<FormState> {
  const money = readMoney(data);
  if (!money.ok) return money.state;
  const input = {
    name: text(data, "name"),
    amountMinor: money.amountMinor,
    currency: money.currency,
    billingDay: Number(text(data, "billingDay")),
    startDate: text(data, "startDate"),
    categoryId: text(data, "categoryId"),
    paymentMethodId: text(data, "paymentMethodId"),
  };
  let state: FormState | undefined;
  try {
    state = withFinance((deps) => {
      // Preserve already-owed charges at the old price before changing the subscription.
      runSubscriptionAutopost(deps);
      const id = text(data, "id");
      const result = id ? updateSubscription(deps, id, input) : createSubscription(deps, input);
      if (!result.ok) return formFailure(result.errors);
      runSubscriptionAutopost(deps);
    });
  } catch {
    return storageError();
  }
  if (state) return state;
  refreshFinance();
  redirect("/subscriptions?saved=1");
}
export async function endSubscriptionAction(_previous: FormState, data: FormData): Promise<FormState> {
  let state: FormState | undefined;
  try {
    state = withFinance((deps) => {
      // Removal is inclusive of today (D-017); catch up before ending it.
      runSubscriptionAutopost(deps);
      const result = removeSubscription(deps, text(data, "id"));
      return result.ok ? undefined : formFailure(result.errors);
    });
  } catch {
    return { error: "We couldn’t end that subscription. Please try again." };
  }
  if (state) return state;
  refreshFinance();
  redirect("/subscriptions?saved=ended");
}
/** Called on app open, on focus, and periodically while the app stays open. BR-1 is idempotent. */
export async function syncDueSubscriptions(): Promise<{ changed: boolean; error?: string }> {
  try {
    const changed = withFinance((deps) => runSubscriptionAutopost(deps).length > 0);
    if (changed) refreshFinance();
    return { changed };
  } catch {
    return {
      changed: false,
      error: "Subscription charges couldn’t be checked. We’ll retry when you return to the app.",
    };
  }
}
