import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, type SQL } from "drizzle-orm";
import type * as D from "@/domain/types";
import type { openDatabase } from "../client";
import * as s from "../schema";
import * as m from "./mapping";
import { initializeFirstUse } from "../first-use";

type Db = ReturnType<typeof openDatabase>["db"];
export interface DateRange {
  start: D.IsoDate;
  end: D.IsoDate;
}
export interface ExpenseFilter extends Partial<DateRange> {
  categoryId?: D.Id;
  paymentMethodId?: D.Id;
  bottleId?: D.Id;
  source?: D.ExpenseSource;
}
export type { RemoveBottleResult as BottleRemoval } from "@/domain/bottleRules";
import type { RemoveBottleResult as BottleRemoval } from "@/domain/bottleRules";

/** Synchronous persistence boundary; callers validate and compute domain rules first. */
export function createRepositories(db: Db) {
  let depth = 0;
  function transaction<T>(fn: () => T): T {
    if (depth > 0) return fn();
    return db.transaction(() => {
      depth++;
      try {
        return fn();
      } finally {
        depth--;
      }
    });
  }

  function insertVersion(version: D.BottleRuleVersion) {
    if (!version.ratios.length) throw new Error("A rule version needs ratios");
    db.insert(s.bottleRuleVersion)
      .values({ id: version.id, effective_from: m.utc(version.effectiveFrom), note: version.note })
      .run();
    db.insert(s.bottleRuleRatio)
      .values(version.ratios.map((r) => ({ version_id: version.id, bottle_id: r.bottleId, ratio: r.ratio })))
      .run();
  }
  function readVersion(row: typeof s.bottleRuleVersion.$inferSelect): D.BottleRuleVersion {
    const ratios = db
      .select({ bottleId: s.bottleRuleRatio.bottle_id, ratio: s.bottleRuleRatio.ratio })
      .from(s.bottleRuleRatio)
      .innerJoin(s.bottle, eq(s.bottle.id, s.bottleRuleRatio.bottle_id))
      .where(eq(s.bottleRuleRatio.version_id, row.id))
      .orderBy(asc(s.bottle.sort_order), asc(s.bottle.id))
      .all();
    return { id: row.id, effectiveFrom: row.effective_from, note: row.note, ratios };
  }
  function checkAllocations(income: D.Income, allocations: readonly D.BottleAllocation[]) {
    if (
      !allocations.length ||
      allocations.some(
        (a) => a.incomeId !== income.id || !Number.isSafeInteger(a.amountMinor) || a.amountMinor < 0,
      ) ||
      allocations.reduce((sum, a) => sum + BigInt(a.amountMinor), 0n) !== BigInt(income.amountMinor)
    ) {
      throw new Error("Allocations must belong to the income and sum to its amount");
    }
  }
  function expenseWhere(filter: ExpenseFilter): SQL | undefined {
    return and(
      filter.start === undefined ? undefined : gte(s.expense.date, filter.start),
      filter.end === undefined ? undefined : lt(s.expense.date, filter.end),
      filter.categoryId === undefined ? undefined : eq(s.expense.category_id, filter.categoryId),
      filter.paymentMethodId === undefined
        ? undefined
        : eq(s.expense.payment_method_id, filter.paymentMethodId),
      filter.bottleId === undefined ? undefined : eq(s.expense.bottle_id, filter.bottleId),
      filter.source === undefined ? undefined : eq(s.expense.source, filter.source),
    );
  }
  const expenses = {
    get(id: D.Id) {
      const row = db.select().from(s.expense).where(eq(s.expense.id, id)).get();
      return row ? m.fromExpense(row) : undefined;
    },
    list(filter: ExpenseFilter = {}): D.Expense[] {
      return db
        .select()
        .from(s.expense)
        .where(expenseWhere(filter))
        .orderBy(asc(s.expense.date), asc(s.expense.id))
        .all()
        .map(m.fromExpense);
    },
    insert(value: D.Expense) {
      return m.fromExpense(db.insert(s.expense).values(m.toExpense(value)).returning().get());
    },
    insertMany(values: readonly D.Expense[]): D.Expense[] {
      return transaction(() =>
        values.flatMap((value) =>
          db
            .insert(s.expense)
            .values(m.toExpense(value))
            .onConflictDoNothing({ target: [s.expense.subscription_id, s.expense.billing_month] })
            .returning()
            .all()
            .map(m.fromExpense),
        ),
      );
    },
    update(value: D.Expense) {
      const { id: _id, created_at: _created, ...patch } = m.toExpense(value);
      void _id;
      void _created;
      const row = db.update(s.expense).set(patch).where(eq(s.expense.id, value.id)).returning().get();
      return row ? m.fromExpense(row) : undefined;
    },
    delete(id: D.Id) {
      return db.delete(s.expense).where(eq(s.expense.id, id)).run().changes > 0;
    },
    postedChargeKeys(subscriptionId?: D.Id): Set<string> {
      return new Set(
        db
          .select()
          .from(s.expense)
          .where(
            and(
              eq(s.expense.source, "subscription"),
              subscriptionId === undefined ? undefined : eq(s.expense.subscription_id, subscriptionId),
            ),
          )
          .all()
          .map((row) => `${row.subscription_id!}|${row.billing_month!}`),
      );
    },
  };
  const subscriptions = {
    insert(value: D.Subscription): D.Subscription {
      return subscriptions.create(value);
    },
    get(id: D.Id) {
      const row = db.select().from(s.subscription).where(eq(s.subscription.id, id)).get();
      return row ? m.fromSubscription(row) : undefined;
    },
    list(): D.Subscription[] {
      return db
        .select()
        .from(s.subscription)
        .orderBy(asc(s.subscription.name), asc(s.subscription.id))
        .all()
        .map(m.fromSubscription);
    },
    create(value: D.Subscription) {
      return m.fromSubscription(db.insert(s.subscription).values(m.toSubscription(value)).returning().get());
    },
    update(value: D.Subscription) {
      const { id: _id, created_at: _created, ...patch } = m.toSubscription(value);
      void _id;
      void _created;
      const row = db
        .update(s.subscription)
        .set(patch)
        .where(eq(s.subscription.id, value.id))
        .returning()
        .get();
      return row ? m.fromSubscription(row) : undefined;
    },
    updatePrice(id: D.Id, price: D.Money, now: D.IsoTimestamp) {
      const row = db
        .update(s.subscription)
        .set({ amount_minor: price.amountMinor, currency: price.currency, updated_at: m.utc(now) })
        .where(eq(s.subscription.id, id))
        .returning()
        .get();
      return row ? m.fromSubscription(row) : undefined;
    },
    end(id: D.Id, endDate: D.IsoDate, now: D.IsoTimestamp) {
      const row = db
        .update(s.subscription)
        .set({ end_date: endDate, updated_at: m.utc(now) })
        .where(eq(s.subscription.id, id))
        .returning()
        .get();
      return row ? m.fromSubscription(row) : undefined;
    },
  };
  const incomes = {
    get(id: D.Id) {
      const row = db.select().from(s.income).where(eq(s.income.id, id)).get();
      return row ? m.fromIncome(row) : undefined;
    },
    list(range?: DateRange): D.Income[] {
      return db
        .select()
        .from(s.income)
        .where(range ? and(gte(s.income.date, range.start), lt(s.income.date, range.end)) : undefined)
        .orderBy(asc(s.income.date), asc(s.income.id))
        .all()
        .map(m.fromIncome);
    },
    insert(value: D.Income, allocations?: readonly D.BottleAllocation[]): D.Income {
      if (allocations) checkAllocations(value, allocations);
      return transaction(() => {
        const row = db.insert(s.income).values(m.toIncome(value)).returning().get();
        if (allocations) db.insert(s.bottleAllocation).values(allocations.map(m.toBottleAllocation)).run();
        return m.fromIncome(row);
      });
    },
    update(value: D.Income, rows?: readonly D.BottleAllocation[]): D.Income {
      if (rows) checkAllocations(value, rows);
      return transaction(() => {
        const { id: _id, ...patch } = m.toIncome(value);
        void _id;
        const row = db.update(s.income).set(patch).where(eq(s.income.id, value.id)).returning().get();
        if (!row) throw new Error("Income not found");
        if (rows) {
          db.delete(s.bottleAllocation).where(eq(s.bottleAllocation.income_id, value.id)).run();
          db.insert(s.bottleAllocation).values(rows.map(m.toBottleAllocation)).run();
        }
        return m.fromIncome(row);
      });
    },
    delete(id: D.Id): boolean {
      return transaction(() => {
        db.delete(s.bottleAllocation).where(eq(s.bottleAllocation.income_id, id)).run();
        return db.delete(s.income).where(eq(s.income.id, id)).run().changes > 0;
      });
    },
    allocationsByIncomeIds(ids: readonly D.Id[]): D.BottleAllocation[] {
      if (!ids.length) return [];
      return db
        .select()
        .from(s.bottleAllocation)
        .where(inArray(s.bottleAllocation.income_id, [...ids]))
        .orderBy(asc(s.bottleAllocation.income_id), asc(s.bottleAllocation.id))
        .all()
        .map(m.fromBottleAllocation);
    },
    allocationsByDateRange(range: DateRange): D.BottleAllocation[] {
      return db
        .select({ allocation: s.bottleAllocation })
        .from(s.bottleAllocation)
        .innerJoin(s.income, eq(s.income.id, s.bottleAllocation.income_id))
        .where(and(gte(s.income.date, range.start), lt(s.income.date, range.end)))
        .orderBy(asc(s.income.date), asc(s.bottleAllocation.id))
        .all()
        .map((row) => m.fromBottleAllocation(row.allocation));
    },
    replaceAllocations(value: D.Income, allocations: readonly D.BottleAllocation[]): D.Income {
      checkAllocations(value, allocations);
      return transaction(() => {
        const existing = db.select().from(s.income).where(eq(s.income.id, value.id)).get();
        if (!existing) throw new Error("Income not found");
        if (existing.amount_minor !== value.amountMinor || existing.currency !== value.currency)
          throw new Error("Re-split cannot change income money");
        const row = db
          .update(s.income)
          .set({ bottle_rule_version_id: value.bottleRuleVersionId })
          .where(eq(s.income.id, value.id))
          .returning()
          .get();
        db.delete(s.bottleAllocation).where(eq(s.bottleAllocation.income_id, value.id)).run();
        db.insert(s.bottleAllocation).values(allocations.map(m.toBottleAllocation)).run();
        return m.fromIncome(row);
      });
    },
  };

  const bottles = {
    active() {
      return bottles.list(false);
    },
    get(id: D.Id) {
      const row = db.select().from(s.bottle).where(eq(s.bottle.id, id)).get();
      return row ? m.fromBottle(row) : undefined;
    },
    list(includeArchived = true): D.Bottle[] {
      return db
        .select()
        .from(s.bottle)
        .where(includeArchived ? undefined : isNull(s.bottle.archived_at))
        .orderBy(asc(s.bottle.sort_order), asc(s.bottle.id))
        .all()
        .map(m.fromBottle);
    },
    create(value: D.Bottle) {
      return m.fromBottle(db.insert(s.bottle).values(m.toBottle(value)).returning().get());
    },
    update(value: D.Bottle) {
      const { id: _id, ...patch } = m.toBottle(value);
      void _id;
      const row = db.update(s.bottle).set(patch).where(eq(s.bottle.id, value.id)).returning().get();
      return row ? m.fromBottle(row) : undefined;
    },
    archive(id: D.Id, now: D.IsoTimestamp) {
      const row = db
        .update(s.bottle)
        .set({ archived_at: m.utc(now) })
        .where(eq(s.bottle.id, id))
        .returning()
        .get();
      return row ? m.fromBottle(row) : undefined;
    },
    rename(id: D.Id, name: string) {
      const row = db.update(s.bottle).set({ name }).where(eq(s.bottle.id, id)).returning().get();
      return row ? m.fromBottle(row) : undefined;
    },
  };

  const categories = {
    active() {
      return categories.list(false);
    },
    get(id: D.Id) {
      const row = db.select().from(s.category).where(eq(s.category.id, id)).get();
      return row ? m.fromCategory(row) : undefined;
    },
    list(includeArchived = true): D.Category[] {
      return db
        .select()
        .from(s.category)
        .where(includeArchived ? undefined : isNull(s.category.archived_at))
        .orderBy(asc(s.category.name), asc(s.category.id))
        .all()
        .map(m.fromCategory);
    },
    create(value: D.Category) {
      return m.fromCategory(db.insert(s.category).values(m.toCategory(value)).returning().get());
    },
    update(value: D.Category) {
      const { id: _id, ...patch } = m.toCategory(value);
      void _id;
      const row = db.update(s.category).set(patch).where(eq(s.category.id, value.id)).returning().get();
      return row ? m.fromCategory(row) : undefined;
    },
    archive(id: D.Id, now: D.IsoTimestamp) {
      const row = db
        .update(s.category)
        .set({ archived_at: m.utc(now) })
        .where(eq(s.category.id, id))
        .returning()
        .get();
      return row ? m.fromCategory(row) : undefined;
    },
  };

  const paymentMethods = {
    active() {
      return paymentMethods.list(false);
    },
    get(id: D.Id) {
      const row = db.select().from(s.paymentMethod).where(eq(s.paymentMethod.id, id)).get();
      return row ? m.fromPaymentMethod(row) : undefined;
    },
    list(includeArchived = true): D.PaymentMethod[] {
      return db
        .select()
        .from(s.paymentMethod)
        .where(includeArchived ? undefined : isNull(s.paymentMethod.archived_at))
        .orderBy(asc(s.paymentMethod.name), asc(s.paymentMethod.id))
        .all()
        .map(m.fromPaymentMethod);
    },
    create(value: D.PaymentMethod) {
      return m.fromPaymentMethod(
        db.insert(s.paymentMethod).values(m.toPaymentMethod(value)).returning().get(),
      );
    },
    update(value: D.PaymentMethod) {
      const { id: _id, ...patch } = m.toPaymentMethod(value);
      void _id;
      const row = db
        .update(s.paymentMethod)
        .set(patch)
        .where(eq(s.paymentMethod.id, value.id))
        .returning()
        .get();
      return row ? m.fromPaymentMethod(row) : undefined;
    },
    archive(id: D.Id, now: D.IsoTimestamp) {
      const row = db
        .update(s.paymentMethod)
        .set({ archived_at: m.utc(now) })
        .where(eq(s.paymentMethod.id, id))
        .returning()
        .get();
      return row ? m.fromPaymentMethod(row) : undefined;
    },
  };

  const ruleVersions = {
    list(): D.BottleRuleVersion[] {
      return db
        .select()
        .from(s.bottleRuleVersion)
        .orderBy(asc(s.bottleRuleVersion.effective_from), asc(s.bottleRuleVersion.id))
        .all()
        .map(readVersion);
    },
    latest(at?: D.IsoTimestamp): D.BottleRuleVersion | undefined {
      const row = db
        .select()
        .from(s.bottleRuleVersion)
        .where(at === undefined ? undefined : lte(s.bottleRuleVersion.effective_from, m.utc(at)))
        .orderBy(desc(s.bottleRuleVersion.effective_from), desc(s.bottleRuleVersion.id))
        .get();
      return row ? readVersion(row) : undefined;
    },
    insert(version: D.BottleRuleVersion): D.BottleRuleVersion {
      return transaction(() => {
        insertVersion(version);
        return readVersion(
          db.select().from(s.bottleRuleVersion).where(eq(s.bottleRuleVersion.id, version.id)).get()!,
        );
      });
    },
  };
  const transfers = {
    insert(value: D.BottleTransfer): D.BottleTransfer {
      return m.fromBottleTransfer(
        db.insert(s.bottleTransfer).values(m.toBottleTransfer(value)).returning().get(),
      );
    },
    list(range?: DateRange): D.BottleTransfer[] {
      return db
        .select()
        .from(s.bottleTransfer)
        .where(
          range
            ? and(gte(s.bottleTransfer.date, range.start), lt(s.bottleTransfer.date, range.end))
            : undefined,
        )
        .orderBy(asc(s.bottleTransfer.date), asc(s.bottleTransfer.id))
        .all()
        .map(m.fromBottleTransfer);
    },
  };
  const settings = {
    get(): D.Settings {
      const row = db.select().from(s.settings).where(eq(s.settings.id, 1)).get();
      if (!row) throw new Error("Settings missing; run db:seed first");
      if (row.first_used_on === null)
        throw new Error("Settings first use is not initialized; run db:seed first");
      if (!Number.isInteger(row.week_starts_on) || row.week_starts_on < 0 || row.week_starts_on > 6)
        throw new Error("Invalid week start");
      return {
        firstUsedOn: row.first_used_on,
        baseCurrency: row.base_currency,
        payDays: row.pay_days,
        weekStartsOn: row.week_starts_on as D.WeekStart,
        timezone: row.timezone,
      };
    },
    update(value: D.Settings): D.Settings {
      if (!value.payDays.length || value.payDays.some((day) => !Number.isInteger(day) || day < 1 || day > 31))
        throw new Error("Invalid pay days");
      // Validate IANA timezone before storing it.
      new Intl.DateTimeFormat("en", { timeZone: value.timezone });
      const row = {
        base_currency: value.baseCurrency,
        pay_days: value.payDays,
        week_starts_on: value.weekStartsOn,
        timezone: value.timezone,
      };
      transaction(() => {
        db.insert(s.settings)
          .values({ id: 1, ...row })
          .onConflictDoUpdate({ target: s.settings.id, set: row })
          .run();
        initializeFirstUse(db);
      });
      return settings.get()!;
    },
  };
  const exchangeRates = {
    get(month: D.IsoMonth, currency: D.CurrencyCode): D.ExchangeRate | undefined {
      const row = db
        .select()
        .from(s.exchangeRate)
        .where(and(eq(s.exchangeRate.month, month), eq(s.exchangeRate.currency, currency)))
        .get();
      return row ? m.fromExchangeRate(row) : undefined;
    },
    list(months?: readonly D.IsoMonth[]): D.ExchangeRate[] {
      if (months?.length === 0) return [];
      return db
        .select()
        .from(s.exchangeRate)
        .where(months ? inArray(s.exchangeRate.month, [...months]) : undefined)
        .orderBy(asc(s.exchangeRate.month), asc(s.exchangeRate.currency))
        .all()
        .map(m.fromExchangeRate);
    },
    upsert(value: D.ExchangeRate): D.ExchangeRate {
      const row = m.toExchangeRate(value);
      return m.fromExchangeRate(
        db
          .insert(s.exchangeRate)
          .values(row)
          .onConflictDoUpdate({
            target: [s.exchangeRate.month, s.exchangeRate.currency],
            set: { rate_to_base: value.rateToBase },
          })
          .returning()
          .get(),
      );
    },
  };
  const livingLimits = {
    get(month: D.IsoMonth): D.LivingLimit | undefined {
      const row = db.select().from(s.livingLimit).where(eq(s.livingLimit.month, month)).get();
      return row ? m.fromLivingLimit(row) : undefined;
    },
    list(): D.LivingLimit[] {
      return db.select().from(s.livingLimit).orderBy(asc(s.livingLimit.month)).all().map(m.fromLivingLimit);
    },
    upsert(value: D.LivingLimit): D.LivingLimit {
      const row = m.toLivingLimit(value);
      return m.fromLivingLimit(
        db
          .insert(s.livingLimit)
          .values(row)
          .onConflictDoUpdate({ target: s.livingLimit.month, set: { limit_minor: value.limitMinor } })
          .returning()
          .get(),
      );
    },
  };
  const allocations = {
    deleteForIncome(incomeId: D.Id): void {
      db.delete(s.bottleAllocation).where(eq(s.bottleAllocation.income_id, incomeId)).run();
    },
    list(): D.BottleAllocation[] {
      return db
        .select()
        .from(s.bottleAllocation)
        .orderBy(asc(s.bottleAllocation.id))
        .all()
        .map(m.fromBottleAllocation);
    },
    insertMany(rows: readonly D.BottleAllocation[]): void {
      transaction(() => {
        for (const row of rows) db.insert(s.bottleAllocation).values(m.toBottleAllocation(row)).run();
      });
    },
    replaceForIncome(incomeId: D.Id, rows: readonly D.BottleAllocation[]): void {
      transaction(() => {
        const income = incomes.get(incomeId);
        if (!income) throw new Error("Income not found");
        checkAllocations(income, rows);
        db.delete(s.bottleAllocation).where(eq(s.bottleAllocation.income_id, incomeId)).run();
        allocations.insertMany(rows);
      });
    },
  };
  const reminders = {
    delete(slot: D.IsoDate): void {
      db.delete(s.reminder).where(eq(s.reminder.slot, slot)).run();
    },
    list(): D.Reminder[] {
      return db
        .select()
        .from(s.reminder)
        .orderBy(asc(s.reminder.slot))
        .all()
        .map((r) => ({ slot: r.slot, status: r.status, resolvedAt: r.resolved_at }));
    },
    upsert(value: D.Reminder): D.Reminder {
      const row = {
        slot: value.slot,
        status: value.status,
        resolved_at: value.resolvedAt === null ? null : m.utc(value.resolvedAt),
      };
      const saved = db
        .insert(s.reminder)
        .values(row)
        .onConflictDoUpdate({ target: s.reminder.slot, set: row })
        .returning()
        .get();
      return { slot: saved.slot, status: saved.status, resolvedAt: saved.resolved_at };
    },
  };
  const monthlyReports = {
    months(): D.IsoMonth[] {
      return db
        .select({ month: s.monthlyReport.month })
        .from(s.monthlyReport)
        .orderBy(asc(s.monthlyReport.month))
        .all()
        .map((r) => r.month);
    },
    get(month: D.IsoMonth): D.MonthlyReport | undefined {
      const row = db.select().from(s.monthlyReport).where(eq(s.monthlyReport.month, month)).get();
      return row ? (row.payload as D.MonthlyReport) : undefined;
    },
    /** Drop a stale snapshot; it is rebuilt on the next open (services invalidate on writes to closed months). */
    delete(month: D.IsoMonth): void {
      db.delete(s.monthlyReport).where(eq(s.monthlyReport.month, month)).run();
    },
    upsert(month: D.IsoMonth, report: D.MonthlyReport, generatedAt: D.IsoTimestamp): void {
      if (month !== report.month) throw new Error("Report month does not match key");
      const row = { month, payload: report, generated_at: m.utc(generatedAt) };
      db.insert(s.monthlyReport)
        .values(row)
        .onConflictDoUpdate({ target: s.monthlyReport.month, set: row })
        .run();
    },
  };
  function applyBottleRemoval(result: BottleRemoval): void {
    if (result.bottle.archivedAt === null) throw new Error("Removed bottle needs archivedAt");
    transaction(() => {
      if (
        db
          .update(s.bottle)
          .set({ archived_at: m.utc(result.bottle.archivedAt!) })
          .where(eq(s.bottle.id, result.bottle.id))
          .run().changes !== 1
      )
        throw new Error("Bottle not found");
      if (result.transfer) transfers.insert(result.transfer);
      for (const category of result.categories) {
        if (
          db
            .update(s.category)
            .set({ default_bottle_id: category.defaultBottleId })
            .where(eq(s.category.id, category.id))
            .run().changes !== 1
        )
          throw new Error("Category not found");
      }
      insertVersion(result.ruleVersion);
    });
  }
  return {
    expenses,
    subscriptions,
    incomes,
    bottles,
    categories,
    paymentMethods,
    ruleVersions,
    transfers,
    settings,
    exchangeRates,
    livingLimits,
    applyBottleRemoval,
    allocations,
    reminders,
    monthlyReports,
    transaction,
  };
}

/** Complete synchronous adapter surface, including UI conveniences. */
export type Repositories = ReturnType<typeof createRepositories>;
