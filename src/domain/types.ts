/**
 * Shared domain types — the contract between layers (docs/data-model.md).
 * camelCase here; snake_case only in the DB, mapped in src/db (D-011).
 * Pure types: no runtime code.
 */

// ---------- primitives ----------

/** Calendar date `YYYY-MM-DD` (user's local time zone). */
export type IsoDate = string;
/** Month `YYYY-MM`. */
export type IsoMonth = string;
/** ISO-8601 timestamp. */
export type IsoTimestamp = string;
/** Text UUID. */
export type Id = string;

/** Extensible list of supported currencies (D-013). */
export type CurrencyCode = "USD" | "VND";

/** Integer minor units (cents, đồng) + currency. Never floats. */
export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

// ---------- settings & lookups ----------

/** 0 = Sunday … 6 = Saturday. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Settings {
  baseCurrency: CurrencyCode;
  /** Days of month, default [10, 25]. */
  payDays: number[];
  /** 0 = Sunday … 6 = Saturday; 1 = Monday (default). */
  weekStartsOn: WeekStart;
  /** IANA zone, e.g. "America/Los_Angeles". */
  timezone: string;
}

export type PaymentMethodType = "credit" | "debit" | "cash";

export interface PaymentMethod {
  id: Id;
  name: string;
  type: PaymentMethodType;
  last4: string | null;
  archivedAt: IsoTimestamp | null;
}

export type CategoryKind = "subscription" | "daily" | "other";

export interface Category {
  id: Id;
  name: string;
  kind: CategoryKind;
  countsTowardLivingLimit: boolean;
  defaultBottleId: Id | null;
  /** Hex token from theme. */
  color: string;
  /** Mascot/icon key. */
  mascot: string;
  archivedAt: IsoTimestamp | null;
}

// ---------- expenses & subscriptions ----------

export type ExpenseSource = "manual" | "subscription";

export interface Expense {
  id: Id;
  date: IsoDate;
  /** > 0, minor units of `currency`. */
  amountMinor: number;
  currency: CurrencyCode;
  /**
   * Rate snapshot used for reports. null = no per-transaction rate: base-currency
   * amounts need none; otherwise fall back to the month's exchange rate (BR-8).
   */
  fxRateToBase: number | null;
  categoryId: Id;
  paymentMethodId: Id;
  bottleId: Id | null;
  note: string | null;
  source: ExpenseSource;
  subscriptionId: Id | null;
  /** Unique together with subscriptionId. */
  billingMonth: IsoMonth | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Subscription {
  id: Id;
  name: string;
  /** Current price, minor units. */
  amountMinor: number;
  currency: CurrencyCode;
  categoryId: Id;
  paymentMethodId: Id;
  /** 1–31, clamped to month end. */
  billingDay: number;
  startDate: IsoDate;
  /** Set when removed; null = active. */
  endDate: IsoDate | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

// ---------- income & bottles ----------

export interface Income {
  id: Id;
  date: IsoDate;
  amountMinor: number;
  currency: CurrencyCode;
  /** Same semantics as Expense.fxRateToBase. */
  fxRateToBase: number | null;
  /** Free text, e.g. "Salary". */
  source: string;
  note: string | null;
  /** Pay day this income resolves, e.g. "2026-11-10". */
  payDaySlot: IsoDate | null;
  bottleRuleVersionId: Id;
}

export interface Bottle {
  id: Id;
  name: string;
  mascot: string;
  sortOrder: number;
  archivedAt: IsoTimestamp | null;
}

export interface BottleRatio {
  bottleId: Id;
  /** Positive integer. */
  ratio: number;
}

/** A rule version with its ratios (joined from bottle_rule_version + bottle_rule_ratio). */
export interface BottleRuleVersion {
  id: Id;
  effectiveFrom: IsoTimestamp;
  note: string | null;
  ratios: BottleRatio[];
}

export interface BottleAllocation {
  id: Id;
  incomeId: Id;
  bottleId: Id;
  /** In the income's currency. */
  amountMinor: number;
}

export interface BottleTransfer {
  id: Id;
  fromBottleId: Id;
  toBottleId: Id;
  amountMinor: number;
  currency: CurrencyCode;
  date: IsoDate;
  note: string | null;
}

/** Total allocated to a bottle in a period (base currency minor units). */
export interface BottleTotal {
  bottleId: Id;
  totalMinor: number;
}

export interface BottleBalance {
  bottleId: Id;
  /** Base currency minor units. */
  balanceMinor: number;
}

// ---------- limits, rates, reminders ----------

export interface LivingLimit {
  month: IsoMonth;
  /** Base currency minor units. */
  limitMinor: number;
}

export type LivingLimitStatusKind = "ok" | "warning" | "over";

export interface LivingLimitStatus {
  month: IsoMonth;
  limitMinor: number;
  spentMinor: number;
  /** spent / limit (0.8 = 80 %). If limitMinor is 0: 0 when nothing spent, else Infinity (status "over"). */
  ratio: number;
  status: LivingLimitStatusKind;
}

export interface ExchangeRate {
  month: IsoMonth;
  currency: CurrencyCode;
  /** 1 unit of `currency` = rateToBase × base currency. */
  rateToBase: number;
}

export type ReminderStatus = "pending" | "done" | "dismissed";

export interface Reminder {
  /** Pay day `YYYY-MM-DD` (primary key). */
  slot: IsoDate;
  status: ReminderStatus;
  resolvedAt: IsoTimestamp | null;
}

// ---------- periods & reports (D-012) ----------

export type Granularity = "week" | "month" | "year";

/**
 * Half-open range [start, end). Ids: week = start date `YYYY-MM-DD`,
 * month = `YYYY-MM`, year = `YYYY`.
 */
export interface Period {
  granularity: Granularity;
  id: string;
  start: IsoDate;
  end: IsoDate;
}

/** Amounts in base currency minor units. */
export interface CategoryTotal {
  categoryId: Id;
  totalMinor: number;
}

export interface PaymentMethodTotal {
  paymentMethodId: Id;
  type: PaymentMethodType;
  totalMinor: number;
}

export interface TopExpense {
  expenseId: Id;
  date: IsoDate;
  categoryId: Id;
  /** Converted to base currency. */
  amountMinor: number;
  note: string | null;
}

export interface MonthlyReport {
  month: IsoMonth;
  baseCurrency: CurrencyCode;
  totalSpendMinor: number;
  byCategory: CategoryTotal[];
  byPaymentMethod: PaymentMethodTotal[];
  /** By payment-method type: credit vs debit vs cash. */
  byPaymentType: Record<PaymentMethodType, number>;
  /** Total per category kind (subscription / daily / other); sums to totalSpendMinor. */
  byKind: Record<CategoryKind, number>;
  incomeTotalMinor: number;
  bottleAllocations: BottleTotal[];
  bottleBalances: BottleBalance[];
  livingLimit: LivingLimitStatus | null;
  /** Up to 5. */
  topExpenses: TopExpense[];
  /** Total spend minus previous month's; null if no previous month. */
  deltaVsPreviousMinor: number | null;
  /** Expenses lacking an FX rate (BR-8); excluded from totals. */
  missingRateExpenseIds: Id[];
}

export interface ComparisonPoint {
  period: Period;
  byCategory: CategoryTotal[];
  incomeMinor: number;
  spendMinor: number;
  livingLimitMinor: number | null;
  livingSpentMinor: number;
  /** Expenses without an FX rate (BR-8), excluded from totals. */
  missingRateCount: number;
}

export interface ComparisonSeries {
  granularity: Granularity;
  baseCurrency: CurrencyCode;
  /** Oldest → newest, last N periods (default 5). */
  points: ComparisonPoint[];
}
