/**
 * Repository ports the services depend on. codex2's `createRepositories(db)` (#15)
 * must satisfy `Repositories`; tests use in-memory fakes. Synchronous, domain-typed
 * (camelCase, D-011). `transaction` runs `fn` atomically: on throw, nothing persists.
 */
import type {
  Bottle,
  BottleAllocation,
  BottleRuleVersion,
  BottleTransfer,
  Category,
  ExchangeRate,
  Expense,
  Id,
  Income,
  IsoMonth,
  LivingLimit,
  MonthlyReport,
  PaymentMethod,
  Reminder,
  Settings,
  Subscription,
} from "../domain/types";

export interface Repositories {
  settings: { get(): Settings };
  paymentMethods: { list(): PaymentMethod[] };
  categories: { list(): Category[]; update(category: Category): void };
  bottles: { list(): Bottle[]; update(bottle: Bottle): void };
  /** Versions include their ratios (ordered by bottle sortOrder). Never edited, only inserted. */
  ruleVersions: { list(): BottleRuleVersion[]; insert(version: BottleRuleVersion): void };
  expenses: {
    list(): Expense[];
    insert(expense: Expense): void;
    insertMany(expenses: Expense[]): void;
    /** `subscriptionId|billingMonth` keys of posted subscription charges (see chargeKey). */
    postedChargeKeys(): Set<string>;
  };
  subscriptions: {
    list(): Subscription[];
    get(id: Id): Subscription | undefined;
    update(sub: Subscription): void;
  };
  incomes: {
    list(): Income[];
    get(id: Id): Income | undefined;
    insert(income: Income): void;
    update(income: Income): void;
  };
  allocations: {
    list(): BottleAllocation[];
    insertMany(allocations: BottleAllocation[]): void;
    /** Delete the income's allocations and insert the given ones. */
    replaceForIncome(incomeId: Id, allocations: BottleAllocation[]): void;
  };
  transfers: { list(): BottleTransfer[]; insert(transfer: BottleTransfer): void };
  livingLimits: { get(month: IsoMonth): LivingLimit | undefined; upsert(limit: LivingLimit): void };
  exchangeRates: { list(): ExchangeRate[] };
  reminders: { list(): Reminder[]; upsert(reminder: Reminder): void };
  monthlyReports: {
    get(month: IsoMonth): MonthlyReport | undefined;
    upsert(month: IsoMonth, report: MonthlyReport, generatedAt: string): void;
  };
  /** Run atomically; return value passes through. Nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T;
}

export interface Clock {
  /** Local calendar date `YYYY-MM-DD` (user's time zone). */
  today(): string;
  /** ISO-8601 timestamp. */
  now(): string;
  newId(): Id;
}

export interface ServiceDeps {
  repos: Repositories;
  clock: Clock;
}
