import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  deps: { repos: {}, clock: {} },
  addExpense: vi.fn(),
  editExpense: vi.fn(),
  addIncome: vi.fn(),
  updateIncome: vi.fn(),
  deleteExpense: vi.fn(),
  deleteIncome: vi.fn(),
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  removeSubscription: vi.fn(),
  runSubscriptionAutopost: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("./_lib/finance", () => ({
  withFinance: (fn: (deps: typeof fake.deps) => unknown) => fn(fake.deps),
}));
vi.mock("@/services/transactions", () => ({
  addExpense: fake.addExpense,
  editExpense: fake.editExpense,
  addIncome: fake.addIncome,
  updateIncome: fake.updateIncome,
  deleteExpense: fake.deleteExpense,
  deleteIncome: fake.deleteIncome,
}));
vi.mock("@/services/subscriptions", () => ({
  createSubscription: fake.createSubscription,
  updateSubscription: fake.updateSubscription,
  removeSubscription: fake.removeSubscription,
  runSubscriptionAutopost: fake.runSubscriptionAutopost,
}));
vi.mock("next/cache", () => ({ revalidatePath: fake.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
import { deleteTransaction, endSubscriptionAction, saveSubscription, saveTransaction } from "./actions";
const expenseSaved = (overrides: Record<string, unknown> = {}) => ({
  expense: {
    id: "expense-1",
    date: "2026-11-02",
    amountMinor: 900,
    currency: "USD",
    fxRateToBase: null,
    categoryId: "category-1",
    paymentMethodId: "payment-1",
    bottleId: null,
    note: null,
    source: "manual",
    subscriptionId: null,
    billingMonth: null,
    createdAt: "2026-11-02T12:00:00.000Z",
    updatedAt: "2026-11-02T12:00:00.000Z",
  },
  crossing: null,
  status: null,
  allowance: null,
  ...overrides,
});
const form = (values: Record<string, string>) => {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
};
beforeEach(() => {
  vi.resetAllMocks();
  for (const key of [
    "addExpense",
    "editExpense",
    "addIncome",
    "updateIncome",
    "deleteExpense",
    "deleteIncome",
    "createSubscription",
    "updateSubscription",
    "removeSubscription",
  ] as const)
    fake[key].mockReturnValue({ ok: true, value: {} });
  fake.addExpense.mockReturnValue({ ok: true, value: expenseSaved() });
  fake.editExpense.mockReturnValue({ ok: true, value: expenseSaved() });
  fake.runSubscriptionAutopost.mockReturnValue([]);
});
describe("finance action handoff", () => {
  it("preserves the explicit payday slot when income arrives before payday", async () => {
    await expect(
      saveTransaction(
        {},
        form({
          kind: "income",
          currency: "USD",
          amount: "123.45",
          date: "2026-11-09",
          payDaySlot: "2026-11-10",
          source: "Salary",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/transactions?saved=added");
    expect(fake.addIncome).toHaveBeenCalledWith(
      fake.deps,
      expect.objectContaining({ date: "2026-11-09", payDaySlot: "2026-11-10", amountMinor: 12345 }),
    );
  });
  it("uses the income edit service and keeps its explicit slot", async () => {
    await expect(
      saveTransaction(
        {},
        form({
          id: "income-1",
          kind: "income",
          currency: "VND",
          amount: "50000",
          date: "2026-11-09",
          payDaySlot: "2026-11-10",
          source: "Salary",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/transactions?saved=updated");
    expect(fake.updateIncome).toHaveBeenCalledWith(
      fake.deps,
      "income-1",
      expect.objectContaining({ payDaySlot: "2026-11-10", amountMinor: 50000 }),
    );
    expect(fake.addIncome).not.toHaveBeenCalled();
  });
  it("rejects lossy money parsing before invoking a service", async () => {
    expect(
      await saveTransaction({}, form({ kind: "expense", currency: "USD", amount: "1.005" })),
    ).toMatchObject({ fields: { amount: expect.any(String) } });
    expect(fake.addExpense).not.toHaveBeenCalled();
  });
  it("shows domain validation errors without redirecting", async () => {
    fake.addExpense.mockReturnValue({
      ok: false,
      errors: [{ field: "categoryId", message: "Choose an active category" }],
    });
    expect(await saveTransaction({}, form({ kind: "expense", currency: "USD", amount: "12" }))).toMatchObject(
      { fields: { categoryId: "Choose an active category" } },
    );
  });
  it("uses the expense edit service so subscription linkage is preserved there", async () => {
    await expect(
      saveTransaction({}, form({ id: "posted-1", kind: "expense", currency: "USD", amount: "9" })),
    ).rejects.toThrow("REDIRECT:/transactions?saved=updated");
    expect(fake.editExpense).toHaveBeenCalledWith(fake.deps, "posted-1", expect.any(Object));
    expect(fake.addExpense).not.toHaveBeenCalled();
  });
  it("carries a warning crossing into the saved confirmation", async () => {
    fake.addExpense.mockReturnValue({
      ok: true,
      value: expenseSaved({
        crossing: "warning",
        status: {
          month: "2026-11",
          limitMinor: 50_000,
          spentMinor: 43_000,
          ratio: 0.86,
          status: "warning",
        },
        allowance: { leftMinor: 7_000, daysLeft: 28, perDayMinor: 250 },
      }),
    });
    await expect(
      saveTransaction({}, form({ kind: "expense", currency: "USD", amount: "9" })),
    ).rejects.toThrow(
      "REDIRECT:/transactions?saved=added&crossing=warning&percent=86&spent=43000&limit=50000&currency=USD",
    );
  });
  it("carries an over crossing into the saved confirmation", async () => {
    fake.editExpense.mockReturnValue({
      ok: true,
      value: expenseSaved({
        crossing: "over",
        status: {
          month: "2026-11",
          limitMinor: 50_000,
          spentMinor: 52_000,
          ratio: 1.04,
          status: "over",
        },
        allowance: { leftMinor: -2_000, daysLeft: 28, perDayMinor: 0 },
      }),
    });
    await expect(
      saveTransaction({}, form({ id: "expense-1", kind: "expense", currency: "USD", amount: "9" })),
    ).rejects.toThrow("REDIRECT:/transactions?saved=updated&crossing=over&over=2000&currency=USD");
  });
  it("removes a subscription with service-clock today, ignoring a client end date", async () => {
    await expect(endSubscriptionAction({}, form({ id: "sub-1", endDate: "2099-01-01" }))).rejects.toThrow(
      "REDIRECT:/subscriptions?saved=ended",
    );
    expect(fake.removeSubscription).toHaveBeenCalledWith(fake.deps, "sub-1");
  });
  it("posts owed charges before and after a subscription change", async () => {
    await expect(
      saveSubscription(
        {},
        form({
          id: "sub-1",
          currency: "USD",
          amount: "15",
          name: "Music",
          billingDay: "31",
          startDate: "2026-11-01",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/subscriptions?saved=1");
    expect(fake.runSubscriptionAutopost).toHaveBeenCalledTimes(2);
    expect(fake.runSubscriptionAutopost.mock.invocationCallOrder[0]).toBeLessThan(
      fake.updateSubscription.mock.invocationCallOrder[0]!,
    );
  });
  it("uses the atomic income delete service", async () => {
    await expect(deleteTransaction({}, form({ id: "income-1", kind: "income" }))).rejects.toThrow(
      "REDIRECT:/transactions?saved=deleted",
    );
    expect(fake.deleteIncome).toHaveBeenCalledWith(fake.deps, "income-1");
  });
});
