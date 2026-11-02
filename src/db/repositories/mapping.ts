import type * as D from "@/domain/types";
import * as s from "../schema";

/** Normalize all timestamps persisted by repositories to UTC milliseconds (D-015). */
export function utc(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid timestamp");
  return date.toISOString();
}

export function fromExpense(row: typeof s.expense.$inferSelect): D.Expense {
  return {
    id: row.id,
    date: row.date,
    amountMinor: row.amount_minor,
    currency: row.currency,
    fxRateToBase: row.fx_rate_to_base,
    categoryId: row.category_id,
    paymentMethodId: row.payment_method_id,
    bottleId: row.bottle_id,
    note: row.note,
    source: row.source,
    subscriptionId: row.subscription_id,
    billingMonth: row.billing_month,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export function toExpense(value: D.Expense): typeof s.expense.$inferInsert {
  return {
    id: value.id,
    date: value.date,
    amount_minor: value.amountMinor,
    currency: value.currency,
    fx_rate_to_base: value.fxRateToBase,
    category_id: value.categoryId,
    payment_method_id: value.paymentMethodId,
    bottle_id: value.bottleId,
    note: value.note,
    source: value.source,
    subscription_id: value.subscriptionId,
    billing_month: value.billingMonth,
    created_at: utc(value.createdAt),
    updated_at: utc(value.updatedAt),
  };
}

export function fromSubscription(row: typeof s.subscription.$inferSelect): D.Subscription {
  return {
    id: row.id,
    name: row.name,
    amountMinor: row.amount_minor,
    currency: row.currency,
    categoryId: row.category_id,
    paymentMethodId: row.payment_method_id,
    billingDay: row.billing_day,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export function toSubscription(value: D.Subscription): typeof s.subscription.$inferInsert {
  return {
    id: value.id,
    name: value.name,
    amount_minor: value.amountMinor,
    currency: value.currency,
    category_id: value.categoryId,
    payment_method_id: value.paymentMethodId,
    billing_day: value.billingDay,
    start_date: value.startDate,
    end_date: value.endDate,
    created_at: utc(value.createdAt),
    updated_at: utc(value.updatedAt),
  };
}

export function fromIncome(row: typeof s.income.$inferSelect): D.Income {
  return {
    id: row.id,
    date: row.date,
    amountMinor: row.amount_minor,
    currency: row.currency,
    fxRateToBase: row.fx_rate_to_base,
    source: row.source,
    note: row.note,
    payDaySlot: row.pay_day_slot,
    bottleRuleVersionId: row.bottle_rule_version_id,
  };
}
export function toIncome(value: D.Income): typeof s.income.$inferInsert {
  return {
    id: value.id,
    date: value.date,
    amount_minor: value.amountMinor,
    currency: value.currency,
    fx_rate_to_base: value.fxRateToBase,
    source: value.source,
    note: value.note,
    pay_day_slot: value.payDaySlot,
    bottle_rule_version_id: value.bottleRuleVersionId,
  };
}

export function fromBottle(row: typeof s.bottle.$inferSelect): D.Bottle {
  return {
    id: row.id,
    name: row.name,
    mascot: row.mascot,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
  };
}
export function toBottle(value: D.Bottle): typeof s.bottle.$inferInsert {
  return {
    id: value.id,
    name: value.name,
    mascot: value.mascot,
    sort_order: value.sortOrder,
    archived_at: value.archivedAt === null ? null : utc(value.archivedAt),
  };
}

export function fromCategory(row: typeof s.category.$inferSelect): D.Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    countsTowardLivingLimit: row.counts_toward_living_limit,
    defaultBottleId: row.default_bottle_id,
    color: row.color,
    mascot: row.mascot,
    archivedAt: row.archived_at,
  };
}
export function toCategory(value: D.Category): typeof s.category.$inferInsert {
  return {
    id: value.id,
    name: value.name,
    kind: value.kind,
    counts_toward_living_limit: value.countsTowardLivingLimit,
    default_bottle_id: value.defaultBottleId,
    color: value.color,
    mascot: value.mascot,
    archived_at: value.archivedAt === null ? null : utc(value.archivedAt),
  };
}

export function fromPaymentMethod(row: typeof s.paymentMethod.$inferSelect): D.PaymentMethod {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    last4: row.last4,
    archivedAt: row.archived_at,
  };
}
export function toPaymentMethod(value: D.PaymentMethod): typeof s.paymentMethod.$inferInsert {
  return {
    id: value.id,
    name: value.name,
    type: value.type,
    last4: value.last4,
    archived_at: value.archivedAt === null ? null : utc(value.archivedAt),
  };
}

export function fromBottleAllocation(row: typeof s.bottleAllocation.$inferSelect): D.BottleAllocation {
  return {
    id: row.id,
    incomeId: row.income_id,
    bottleId: row.bottle_id,
    amountMinor: row.amount_minor,
  };
}
export function toBottleAllocation(value: D.BottleAllocation): typeof s.bottleAllocation.$inferInsert {
  return {
    id: value.id,
    income_id: value.incomeId,
    bottle_id: value.bottleId,
    amount_minor: value.amountMinor,
  };
}

export function fromBottleTransfer(row: typeof s.bottleTransfer.$inferSelect): D.BottleTransfer {
  return {
    id: row.id,
    fromBottleId: row.from_bottle_id,
    toBottleId: row.to_bottle_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    date: row.date,
    note: row.note,
  };
}
export function toBottleTransfer(value: D.BottleTransfer): typeof s.bottleTransfer.$inferInsert {
  return {
    id: value.id,
    from_bottle_id: value.fromBottleId,
    to_bottle_id: value.toBottleId,
    amount_minor: value.amountMinor,
    currency: value.currency,
    date: value.date,
    note: value.note,
  };
}

export function fromExchangeRate(row: typeof s.exchangeRate.$inferSelect): D.ExchangeRate {
  return {
    month: row.month,
    currency: row.currency,
    rateToBase: row.rate_to_base,
  };
}
export function toExchangeRate(value: D.ExchangeRate): typeof s.exchangeRate.$inferInsert {
  return {
    month: value.month,
    currency: value.currency,
    rate_to_base: value.rateToBase,
  };
}

export function fromLivingLimit(row: typeof s.livingLimit.$inferSelect): D.LivingLimit {
  return {
    month: row.month,
    limitMinor: row.limit_minor,
  };
}
export function toLivingLimit(value: D.LivingLimit): typeof s.livingLimit.$inferInsert {
  return {
    month: value.month,
    limit_minor: value.limitMinor,
  };
}
