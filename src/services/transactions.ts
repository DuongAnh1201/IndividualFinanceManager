import { activeRuleVersion, allocateIncome } from "../domain/bottleSplit";
import { validateExpense, type ExpenseInput } from "../domain/expense";
import { validateIncome, type IncomeInput } from "../domain/income";
import { completeReminder } from "../domain/reminders";
import type { Expense, Id, Income } from "../domain/types";
import { fail, notFound, ok, type FieldError, type Result } from "./result";
import type { ServiceDeps } from "./ports";
import { atomic, invalidateSnapshotsFrom, reopenSlotIfOrphaned } from "./support";

function expenseContext({ repos }: ServiceDeps) {
  return {
    baseCurrency: repos.settings.get().baseCurrency,
    categories: repos.categories.list(),
    paymentMethods: repos.paymentMethods.list(),
    bottles: repos.bottles.list(),
    exchangeRates: repos.exchangeRates.list(),
  };
}

/** Validate (BR-2) and save a manual expense. */
export function addExpense(deps: ServiceDeps, input: ExpenseInput): Result<Expense, FieldError> {
  const { repos, clock } = deps;
  return atomic(deps, () => {
    const v = validateExpense(input, expenseContext(deps));
    if (!v.ok) return fail(v.errors);
    const now = clock.now();
    const expense: Expense = {
      id: clock.newId(),
      ...v.value,
      billingMonth: null,
      createdAt: now,
      updatedAt: now,
    };
    repos.expenses.insert(expense);
    invalidateSnapshotsFrom(deps, [expense.date]);
    return ok(expense);
  });
}

/** Edit an expense; keeps its source / subscriptionId / billingMonth / createdAt. */
export function editExpense(deps: ServiceDeps, id: Id, input: ExpenseInput): Result<Expense, FieldError> {
  const { repos, clock } = deps;
  return atomic(deps, () => {
    const existing = repos.expenses.get(id);
    if (!existing) return notFound("Expense");
    const v = validateExpense(input, expenseContext(deps));
    if (!v.ok) return fail(v.errors);
    // Subscription charges: amount / note / payment method (and currency + rate with the
    // amount) are editable; date and category stay tied to the billing month.
    if (
      existing.source === "subscription" &&
      (v.value.date !== existing.date || v.value.categoryId !== existing.categoryId)
    ) {
      return fail([
        {
          code: "subscription-charge-locked",
          field: v.value.date !== existing.date ? "date" : "categoryId",
          message: "A subscription charge's date and category can't be changed.",
        },
      ]);
    }
    const expense: Expense = {
      ...existing,
      date: v.value.date,
      amountMinor: v.value.amountMinor,
      currency: v.value.currency,
      fxRateToBase: v.value.fxRateToBase,
      categoryId: v.value.categoryId,
      paymentMethodId: v.value.paymentMethodId,
      bottleId: v.value.bottleId,
      note: v.value.note,
      updatedAt: clock.now(),
    };
    repos.expenses.update(expense);
    invalidateSnapshotsFrom(deps, [existing.date, expense.date]);
    return ok(expense);
  });
}

function incomeContext({ repos }: ServiceDeps) {
  return { baseCurrency: repos.settings.get().baseCurrency, exchangeRates: repos.exchangeRates.list() };
}

/**
 * Save an income: validate, split with the rule version active now (BR-3), store the
 * allocations, and mark its pay-day slot done (BR-5) — all in one transaction.
 */
export function addIncome(deps: ServiceDeps, input: IncomeInput): Result<Income, FieldError> {
  const { repos, clock } = deps;
  return atomic(deps, () => {
    const v = validateIncome(input, incomeContext(deps));
    if (!v.ok) return fail(v.errors);
    const now = clock.now();
    const rule = activeRuleVersion(repos.ruleVersions.list(), now);
    if (!rule)
      return fail([{ code: "no-rule", field: "bottleRuleVersionId", message: "No bottle rule is active." }]);
    const income: Income = { id: clock.newId(), ...v.value, bottleRuleVersionId: rule.id };
    repos.incomes.insert(income);
    repos.allocations.insertMany(allocateIncome(income, rule, clock.newId));
    if (income.payDaySlot) repos.reminders.upsert(completeReminder(income.payDaySlot, now));
    invalidateSnapshotsFrom(deps, [income.date]);
    return ok(income);
  });
}

/**
 * Edit an income. Keeps its historical rule version (BR-4: past splits never change
 * silently) and atomically replaces its allocations for the new amount.
 */
export function updateIncome(deps: ServiceDeps, id: Id, input: IncomeInput): Result<Income, FieldError> {
  const { repos, clock } = deps;
  return atomic(deps, () => {
    const existing = repos.incomes.get(id);
    if (!existing) return notFound("Income");
    const v = validateIncome(input, incomeContext(deps));
    if (!v.ok) return fail(v.errors);
    const rule = repos.ruleVersions.list().find((r) => r.id === existing.bottleRuleVersionId);
    if (!rule)
      return fail([
        { code: "no-rule", field: "bottleRuleVersionId", message: "Income's bottle rule is missing." },
      ]);
    const income: Income = { ...existing, ...v.value };
    repos.incomes.update(income);
    repos.allocations.replaceForIncome(income.id, allocateIncome(income, rule, clock.newId));
    // Moving the pay-day link reopens the old slot (unless another income resolves it) and resolves the new one.
    if (existing.payDaySlot && existing.payDaySlot !== income.payDaySlot) {
      reopenSlotIfOrphaned(repos, existing.payDaySlot);
    }
    if (income.payDaySlot) repos.reminders.upsert(completeReminder(income.payDaySlot, clock.now()));
    invalidateSnapshotsFrom(deps, [existing.date, income.date]);
    return ok(income);
  });
}

/**
 * Delete a manual expense. Subscription charges cannot be deleted (autopost would
 * re-create them): end or edit the subscription instead.
 */
export function deleteExpense(deps: ServiceDeps, id: Id): Result<{ id: Id }, FieldError> {
  const { repos } = deps;
  return atomic(deps, () => {
    const existing = repos.expenses.get(id);
    if (!existing) return notFound("Expense");
    if (existing.source === "subscription") {
      return fail([
        {
          code: "subscription-charge",
          field: "id",
          message: "Subscription charges can't be deleted; end or edit the subscription instead.",
        },
      ]);
    }
    repos.expenses.delete(id);
    invalidateSnapshotsFrom(deps, [existing.date]);
    return ok({ id });
  });
}

/**
 * Delete an income with its allocations. If it had resolved a pay-day slot and no other
 * income resolves that slot, the slot's stored "done" reminder is removed so it shows
 * as pending again (BR-5).
 */
export function deleteIncome(deps: ServiceDeps, id: Id): Result<{ id: Id }, FieldError> {
  const { repos } = deps;
  return atomic(deps, () => {
    const existing = repos.incomes.get(id);
    if (!existing) return notFound("Income");
    repos.allocations.deleteForIncome(id);
    repos.incomes.delete(id);
    reopenSlotIfOrphaned(repos, existing.payDaySlot);
    invalidateSnapshotsFrom(deps, [existing.date]);
    return ok({ id });
  });
}
