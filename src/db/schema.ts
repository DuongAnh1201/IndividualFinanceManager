import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const currency = () => text("currency", { enum: ["USD", "VND"] }).notNull();
const amount = () => integer("amount_minor").notNull();
const timestamps = () => ({
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    base_currency: text("base_currency", { enum: ["USD", "VND"] })
      .notNull()
      .default("USD"),
    pay_days: text("pay_days", { mode: "json" }).$type<number[]>().notNull().default([10, 25]),
    week_starts_on: integer("week_starts_on").notNull().default(1),
    timezone: text("timezone").notNull(),
    first_used_on: text("first_used_on"),
  },
  (t) => [
    check("settings_currency", sql`${t.base_currency} IN ('USD','VND')`),
    check("settings_singleton", sql`${t.id} = 1`),
    check("settings_week_start", sql`${t.week_starts_on} BETWEEN 0 AND 6`),
  ],
);
export const paymentMethod = sqliteTable(
  "payment_method",
  {
    id: id(),
    name: text("name").notNull(),
    type: text("type", { enum: ["credit", "debit", "cash"] }).notNull(),
    last4: text("last4"),
    archived_at: text("archived_at"),
  },
  (t) => [check("payment_method_type", sql`${t.type} IN ('credit','debit','cash')`)],
);
export const bottle = sqliteTable("bottle", {
  id: id(),
  name: text("name").notNull(),
  mascot: text("mascot").notNull(),
  sort_order: integer("sort_order").notNull(),
  archived_at: text("archived_at"),
});
export const category = sqliteTable(
  "category",
  {
    id: id(),
    name: text("name").notNull().unique(),
    kind: text("kind", { enum: ["subscription", "daily", "other"] }).notNull(),
    counts_toward_living_limit: integer("counts_toward_living_limit", { mode: "boolean" }).notNull(),
    default_bottle_id: text("default_bottle_id").references(() => bottle.id),
    color: text("color").notNull(),
    mascot: text("mascot").notNull(),
    archived_at: text("archived_at"),
  },
  (t) => [
    check("category_kind", sql`${t.kind} IN ('subscription','daily','other')`),
    check("category_living_flag", sql`${t.counts_toward_living_limit} IN (0,1)`),
  ],
);
export const subscription = sqliteTable(
  "subscription",
  {
    id: id(),
    name: text("name").notNull(),
    amount_minor: amount(),
    currency: currency(),
    category_id: text("category_id")
      .notNull()
      .references(() => category.id),
    payment_method_id: text("payment_method_id")
      .notNull()
      .references(() => paymentMethod.id),
    billing_day: integer("billing_day").notNull(),
    start_date: text("start_date").notNull(),
    end_date: text("end_date"),
    ...timestamps(),
  },
  (t) => [
    check("subscription_currency", sql`${t.currency} IN ('USD','VND')`),
    check("subscription_amount", sql`typeof(${t.amount_minor}) = 'integer' AND ${t.amount_minor} > 0`),
    check("subscription_billing_day", sql`${t.billing_day} BETWEEN 1 AND 31`),
  ],
);
export const expense = sqliteTable(
  "expense",
  {
    id: id(),
    date: text("date").notNull(),
    amount_minor: amount(),
    currency: currency(),
    fx_rate_to_base: real("fx_rate_to_base"),
    category_id: text("category_id")
      .notNull()
      .references(() => category.id),
    payment_method_id: text("payment_method_id")
      .notNull()
      .references(() => paymentMethod.id),
    bottle_id: text("bottle_id").references(() => bottle.id),
    note: text("note"),
    source: text("source", { enum: ["manual", "subscription"] }).notNull(),
    subscription_id: text("subscription_id").references(() => subscription.id),
    billing_month: text("billing_month"),
    ...timestamps(),
  },
  (t) => [
    check("expense_currency", sql`${t.currency} IN ('USD','VND')`),
    index("expense_date_idx").on(t.date),
    index("expense_category_idx").on(t.category_id),
    unique("expense_subscription_month").on(t.subscription_id, t.billing_month),
    check("expense_amount", sql`typeof(${t.amount_minor}) = 'integer' AND ${t.amount_minor} > 0`),
    check("expense_source", sql`${t.source} IN ('manual','subscription')`),
    check(
      "expense_billing_link",
      sql`(${t.source} = 'manual' AND ${t.subscription_id} IS NULL AND ${t.billing_month} IS NULL) OR (${t.source} = 'subscription' AND ${t.subscription_id} IS NOT NULL AND ${t.billing_month} IS NOT NULL)`,
    ),
  ],
);
export const bottleRuleVersion = sqliteTable("bottle_rule_version", {
  id: id(),
  effective_from: text("effective_from").notNull(),
  note: text("note"),
});
export const bottleRuleRatio = sqliteTable(
  "bottle_rule_ratio",
  {
    version_id: text("version_id")
      .notNull()
      .references(() => bottleRuleVersion.id),
    bottle_id: text("bottle_id")
      .notNull()
      .references(() => bottle.id),
    ratio: integer("ratio").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.version_id, t.bottle_id] }),
    check("ratio_positive_integer", sql`typeof(${t.ratio}) = 'integer' AND ${t.ratio} > 0`),
  ],
);
export const income = sqliteTable(
  "income",
  {
    id: id(),
    date: text("date").notNull(),
    amount_minor: amount(),
    currency: currency(),
    fx_rate_to_base: real("fx_rate_to_base"),
    source: text("source").notNull(),
    note: text("note"),
    pay_day_slot: text("pay_day_slot"),
    bottle_rule_version_id: text("bottle_rule_version_id")
      .notNull()
      .references(() => bottleRuleVersion.id),
  },
  (t) => [
    index("income_date_idx").on(t.date),
    check("income_currency", sql`${t.currency} IN ('USD','VND')`),
    check("income_amount", sql`typeof(${t.amount_minor}) = 'integer' AND ${t.amount_minor} > 0`),
  ],
);
export const bottleAllocation = sqliteTable(
  "bottle_allocation",
  {
    id: id(),
    income_id: text("income_id")
      .notNull()
      .references(() => income.id),
    bottle_id: text("bottle_id")
      .notNull()
      .references(() => bottle.id),
    amount_minor: amount(),
  },
  (t) => [
    unique("allocation_income_bottle").on(t.income_id, t.bottle_id),
    check("allocation_amount", sql`typeof(${t.amount_minor}) = 'integer' AND ${t.amount_minor} >= 0`),
  ],
);
export const bottleTransfer = sqliteTable(
  "bottle_transfer",
  {
    id: id(),
    from_bottle_id: text("from_bottle_id")
      .notNull()
      .references(() => bottle.id),
    to_bottle_id: text("to_bottle_id")
      .notNull()
      .references(() => bottle.id),
    amount_minor: amount(),
    currency: currency(),
    date: text("date").notNull(),
    note: text("note"),
  },
  (t) => [
    check("transfer_currency", sql`${t.currency} IN ('USD','VND')`),
    check("transfer_amount", sql`typeof(${t.amount_minor}) = 'integer' AND ${t.amount_minor} > 0`),
    check("transfer_distinct_bottles", sql`${t.from_bottle_id} <> ${t.to_bottle_id}`),
  ],
);
export const livingLimit = sqliteTable(
  "living_limit",
  { month: text("month").primaryKey(), limit_minor: integer("limit_minor").notNull() },
  (t) => [
    check("limit_nonnegative_integer", sql`typeof(${t.limit_minor}) = 'integer' AND ${t.limit_minor} >= 0`),
  ],
);
export const exchangeRate = sqliteTable(
  "exchange_rate",
  { month: text("month").notNull(), currency: currency(), rate_to_base: real("rate_to_base").notNull() },
  (t) => [
    check("rate_currency", sql`${t.currency} IN ('USD','VND')`),
    primaryKey({ columns: [t.month, t.currency] }),
    check("rate_positive", sql`${t.rate_to_base} > 0`),
  ],
);
export const monthlyReport = sqliteTable("monthly_report", {
  month: text("month").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
  generated_at: text("generated_at").notNull(),
});
export const reminder = sqliteTable(
  "reminder",
  {
    slot: text("slot").primaryKey(),
    status: text("status", { enum: ["pending", "done", "dismissed"] }).notNull(),
    resolved_at: text("resolved_at"),
  },
  (t) => [check("reminder_status", sql`${t.status} IN ('pending','done','dismissed')`)],
);
