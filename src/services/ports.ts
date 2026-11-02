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
  IsoDate,
  IsoMonth,
  LivingLimit,
  MonthlyReport,
  PaymentMethod,
  Reminder,
  Settings,
  Subscription,
} from "../domain/types";

export interface Repositories {
  settings: { get(): Settings; update(settings: Settings): void };
  paymentMethods: {
    list(): PaymentMethod[];
    create(method: PaymentMethod): void;
    update(method: PaymentMethod): void;
  };
  categories: { list(): Category[]; create(category: Category): void; update(category: Category): void };
  bottles: { list(): Bottle[]; create(bottle: Bottle): void; update(bottle: Bottle): void };
  /** Versions include their ratios (ordered by bottle sortOrder). Never edited, only inserted. */
  ruleVersions: { list(): BottleRuleVersion[]; insert(version: BottleRuleVersion): void };
  expenses: {
    list(): Expense[];
    insert(expense: Expense): void;
    get(id: Id): Expense | undefined;
    update(expense: Expense): void;
    delete(id: Id): void;
    /**
     * Idempotent for subscription charges: ON CONFLICT(subscription_id, billing_month) DO NOTHING
     * (BR-1 race safety). Returns only the rows actually inserted; other constraint errors throw.
     */
    insertMany(expenses: Expense[]): Expense[];
    /** `subscriptionId|billingMonth` keys of posted subscription charges (see chargeKey). */
    postedChargeKeys(): Set<string>;
  };
  subscriptions: {
    list(): Subscription[];
    get(id: Id): Subscription | undefined;
    insert(sub: Subscription): void;
    update(sub: Subscription): void;
  };
  incomes: {
    list(): Income[];
    get(id: Id): Income | undefined;
    insert(income: Income): void;
    update(income: Income): void;
    delete(id: Id): void;
  };
  allocations: {
    list(): BottleAllocation[];
    deleteForIncome(incomeId: Id): void;
    insertMany(allocations: BottleAllocation[]): void;
    /** Delete the income's allocations and insert the given ones. */
    replaceForIncome(incomeId: Id, allocations: BottleAllocation[]): void;
  };
  transfers: { list(): BottleTransfer[]; insert(transfer: BottleTransfer): void };
  livingLimits: {
    list(): LivingLimit[];
    get(month: IsoMonth): LivingLimit | undefined;
    upsert(limit: LivingLimit): void;
  };
  exchangeRates: { list(): ExchangeRate[]; upsert(rate: ExchangeRate): void };
  reminders: {
    list(): Reminder[];
    upsert(reminder: Reminder): void;
    delete(slot: IsoDate): void;
  };
  monthlyReports: {
    /** Months that already have a snapshot. */
    months(): IsoMonth[];
    /** Remove a snapshot (stale after a write touching a closed month). */
    delete(month: IsoMonth): void;
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
