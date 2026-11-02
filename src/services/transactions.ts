import { activeRuleVersion, allocateIncome } from "../domain/bottleSplit";
import { validateExpense, type ExpenseInput } from "../domain/expense";
import { validateIncome, type IncomeInput } from "../domain/income";
import { completeReminder } from "../domain/reminders";
import type { Expense, Id, Income } from "../domain/types";
import { fail, notFound, ok, type FieldError, type Result } from "./result";
import type { ServiceDeps } from "./ports";

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
  return repos.transaction(() => {
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
    return ok(expense);
  });
}

/** Edit an expense; keeps its source / subscriptionId / billingMonth / createdAt. */
export function editExpense(deps: ServiceDeps, id: Id, input: ExpenseInput): Result<Expense, FieldError> {
  const { repos, clock } = deps;
  return repos.transaction(() => {
    const existing = repos.expenses.get(id);
    if (!existing) return notFound("Expense");
    const v = validateExpense(input, expenseContext(deps));
    if (!v.ok) return fail(v.errors);
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
  return repos.transaction(() => {
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
    return ok(income);
  });
}

/**
 * Edit an income. Keeps its historical rule version (BR-4: past splits never change
 * silently) and atomically replaces its allocations for the new amount.
 */
export function updateIncome(deps: ServiceDeps, id: Id, input: IncomeInput): Result<Income, FieldError> {
  const { repos, clock } = deps;
  return repos.transaction(() => {
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
    if (income.payDaySlot) repos.reminders.upsert(completeReminder(income.payDaySlot, clock.now()));
    return ok(income);
  });
}
