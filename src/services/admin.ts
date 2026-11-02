import { renameBottle as renameBottleRule } from "../domain/bottleRules";
import { suggestedLimit, type SuggestedLimit } from "../domain/livingLimit";
import { isCurrencyCode } from "../domain/money";
import { parseDate } from "../domain/period";
import { validatePayDays } from "../domain/reminders";
import type {
  Bottle,
  BottleTransfer,
  Category,
  CategoryKind,
  CurrencyCode,
  ExchangeRate,
  Id,
  IsoDate,
  IsoMonth,
  LivingLimit,
  PaymentMethod,
  PaymentMethodType,
  Settings,
  WeekStart,
} from "../domain/types";
import { fail, notFound, ok, type FieldError, type Result } from "./result";
import type { ServiceDeps } from "./ports";
import { atomic, invalidateSnapshotsFrom } from "./support";

type Errors = FieldError[];
const err = (code: string, field: string, message: string): FieldError => ({ code, field, message });
/** Earliest month: used to drop every saved snapshot when a global setting changes. */
const ALL_MONTHS: IsoDate = "0001-01-01";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validTimezone(tz: unknown): boolean {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------- settings ----------

export interface SettingsInput {
  baseCurrency: string;
  payDays: number[];
  weekStartsOn: number;
  timezone: string;
}

/** Update settings. Changing the base currency or week start makes every saved report stale, so snapshots are dropped. */
export function updateSettings(deps: ServiceDeps, input: SettingsInput): Result<Settings, FieldError> {
  const { repos } = deps;
  return atomic(deps, () => {
    const errors: Errors = [];
    if (!isCurrencyCode(input.baseCurrency))
      errors.push(err("unknown-currency", "baseCurrency", "Unknown currency."));
    try {
      validatePayDays(input.payDays);
    } catch (e) {
      errors.push(err("invalid-pay-days", "payDays", (e as Error).message));
    }
    if (!Number.isInteger(input.weekStartsOn) || input.weekStartsOn < 0 || input.weekStartsOn > 6) {
      errors.push(err("invalid-week-start", "weekStartsOn", "Week start must be 0 (Sunday) to 6."));
    }
    if (!validTimezone(input.timezone))
      errors.push(err("invalid-timezone", "timezone", "Unknown time zone."));
    if (errors.length > 0 || !isCurrencyCode(input.baseCurrency)) return fail(errors);

    const before = repos.settings.get();
    const settings: Settings = {
      firstUsedOn: before.firstUsedOn, // immutable marker: never taken from input
      baseCurrency: input.baseCurrency,
      payDays: [...new Set(input.payDays)].sort((a, b) => a - b),
      weekStartsOn: input.weekStartsOn as WeekStart,
      timezone: input.timezone,
    };
    repos.settings.update(settings);
    if (before.baseCurrency !== settings.baseCurrency || before.weekStartsOn !== settings.weekStartsOn) {
      invalidateSnapshotsFrom(deps, [ALL_MONTHS]);
    }
    return ok(settings);
  });
}

// ---------- categories ----------

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
  countsTowardLivingLimit: boolean;
  defaultBottleId: Id | null;
  color: string;
  mascot: string;
}

function validateCategory(deps: ServiceDeps, input: CategoryInput, selfId?: Id): Errors {
  const { repos } = deps;
  const errors: Errors = [];
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "") errors.push(err("empty-name", "name", "Name must not be empty."));
  else if (
    repos.categories.list().some((c) => c.id !== selfId && c.name.toLowerCase() === name.toLowerCase())
  ) {
    errors.push(err("duplicate-name", "name", "A category with this name already exists."));
  }
  if (!["subscription", "daily", "other"].includes(input.kind))
    errors.push(err("invalid-kind", "kind", "Unknown kind."));
  if (typeof input.countsTowardLivingLimit !== "boolean") {
    errors.push(err("invalid-living-flag", "countsTowardLivingLimit", "Must be true or false."));
  }
  if (!HEX_RE.test(input.color))
    errors.push(err("invalid-color", "color", "Color must be a hex value like #aabbcc."));
  if (typeof input.mascot !== "string" || input.mascot.trim() === "")
    errors.push(err("empty-mascot", "mascot", "Pick a mascot."));
  if (input.defaultBottleId !== null) {
    const b = repos.bottles.list().find((x) => x.id === input.defaultBottleId);
    if (!b) errors.push(err("unknown-bottle", "defaultBottleId", "Unknown bottle."));
    else if (b.archivedAt) errors.push(err("archived-bottle", "defaultBottleId", "Bottle is archived."));
  }
  return errors;
}

export function createCategory(deps: ServiceDeps, input: CategoryInput): Result<Category, FieldError> {
  const { repos, clock } = deps;
  return atomic(deps, () => {
    const errors = validateCategory(deps, input);
    if (errors.length > 0) return fail(errors);
    const category: Category = {
      id: clock.newId(),
      ...input,
      name: input.name.trim(),
      mascot: input.mascot.trim(),
      archivedAt: null,
    };
    repos.categories.create(category);
    return ok(category);
  });
}

/** Edit a category. Kind / living-limit flag change how past months report, so snapshots are dropped. */
export function updateCategory(
  deps: ServiceDeps,
  id: Id,
  input: CategoryInput,
): Result<Category, FieldError> {
  const { repos } = deps;
  return atomic(deps, () => {
    const existing = repos.categories.list().find((c) => c.id === id);
    if (!existing) return notFound("Category");
    const errors = validateCategory(deps, input, id);
    if (errors.length > 0) return fail(errors);
    const category: Category = {
      ...existing,
      ...input,
      name: input.name.trim(),
      mascot: input.mascot.trim(),
    };
    repos.categories.update(category);
    invalidateSnapshotsFrom(deps, [ALL_MONTHS]);
    return ok(category);
  });
}

/** Archive (soft-delete): history keeps its category; new expenses can't use it. */
export function archiveCategory(deps: ServiceDeps, id: Id): Result<Category, FieldError> {
  const { repos, clock } = deps;
  return atomic(deps, () => {
    const existing = repos.categories.list().find((c) => c.id === id);
    if (!existing) return notFound("Category");
    const category: Category = { ...existing, archivedAt: existing.archivedAt ?? clock.now() };
    repos.categories.update(category);
    return ok(category);
  });
}

// ---------- payment methods ----------

export interface PaymentMethodInput {
  name: string;
  type: PaymentMethodType;
  last4: string | null;
}

function validatePaymentMethod(input: PaymentMethodInput): Errors {
  const errors: Errors = [];
  if (typeof input.name !== "string" || input.name.trim() === "")
    errors.push(err("empty-name", "name", "Name must not be empty."));
  if (!["credit", "debit", "cash"].includes(input.type))
    errors.push(err("invalid-type", "type", "Unknown payment type."));
  if (input.last4 !== null && !/^\d{4}$/.test(input.last4))
    errors.push(err("invalid-last4", "last4", "Last 4 must be exactly 4 digits."));
  return errors;
}

export function createPaymentMethod(
  deps: ServiceDeps,
  input: PaymentMethodInput,
): Result<PaymentMethod, FieldError> {
  const { repos, clock } = deps;
  return atomic(deps, () => {
    const errors = validatePaymentMethod(input);
    if (errors.length > 0) return fail(errors);
    const method: PaymentMethod = {
      id: clock.newId(),
      name: input.name.trim(),
      type: input.type,
      last4: input.last4,
      archivedAt: null,
    };
    repos.paymentMethods.create(method);
    return ok(method);
  });
}

/** Changing the type moves past spending between credit/debit/cash in reports, so snapshots are dropped. */
export function updatePaymentMethod(
  deps: ServiceDeps,
  id: Id,
  input: PaymentMethodInput,
): Result<PaymentMethod, FieldError> {
  const { repos } = deps;
  return atomic(deps, () => {
    const existing = repos.paymentMethods.list().find((m) => m.id === id);
    if (!existing) return notFound("Payment method");
    const errors = validatePaymentMethod(input);
    if (errors.length > 0) return fail(errors);
    const method: PaymentMethod = {
      ...existing,
      name: input.name.trim(),
      type: input.type,
      last4: input.last4,
    };
    repos.paymentMethods.update(method);
    if (existing.type !== method.type) invalidateSnapshotsFrom(deps, [ALL_MONTHS]);
    return ok(method);
  });
}

export function archivePaymentMethod(deps: ServiceDeps, id: Id): Result<PaymentMethod, FieldError> {
  const { repos, clock } = deps;
  return atomic(deps, () => {
    const existing = repos.paymentMethods.list().find((m) => m.id === id);
    if (!existing) return notFound("Payment method");
    const method: PaymentMethod = { ...existing, archivedAt: existing.archivedAt ?? clock.now() };
    repos.paymentMethods.update(method);
    return ok(method);
  });
}

// ---------- exchange rates & living limit ----------

/** Save a month's rate (1 unit of `currency` = `rateToBase` × base). Dated reports from that month on are rebuilt. */
export function setExchangeRate(
  deps: ServiceDeps,
  input: { month: IsoMonth; currency: string; rateToBase: number },
): Result<ExchangeRate, FieldError> {
  const { repos } = deps;
  return atomic(deps, () => {
    const errors: Errors = [];
    if (!MONTH_RE.test(input.month)) errors.push(err("invalid-month", "month", "Month must be YYYY-MM."));
    if (!isCurrencyCode(input.currency))
      errors.push(err("unknown-currency", "currency", "Unknown currency."));
    else if (input.currency === repos.settings.get().baseCurrency) {
      errors.push(err("base-currency", "currency", "The base currency needs no exchange rate."));
    }
    if (!Number.isFinite(input.rateToBase) || input.rateToBase <= 0) {
      errors.push(err("invalid-rate", "rateToBase", "Rate must be a positive number."));
    }
    if (errors.length > 0 || !isCurrencyCode(input.currency)) return fail(errors);
    const rate: ExchangeRate = {
      month: input.month,
      currency: input.currency as CurrencyCode,
      rateToBase: input.rateToBase,
    };
    repos.exchangeRates.upsert(rate);
    invalidateSnapshotsFrom(deps, [`${input.month}-01`]);
    return ok(rate);
  });
}

/** Set a month's living limit (base currency minor units, ≥ 0). Later months without their own limit carry it forward. */
export function setLivingLimit(
  deps: ServiceDeps,
  input: { month: IsoMonth; limitMinor: number },
): Result<LivingLimit, FieldError> {
  const { repos } = deps;
  return atomic(deps, () => {
    const errors: Errors = [];
    if (!MONTH_RE.test(input.month)) errors.push(err("invalid-month", "month", "Month must be YYYY-MM."));
    if (!Number.isSafeInteger(input.limitMinor) || input.limitMinor < 0) {
      errors.push(
        err("invalid-limit", "limitMinor", "Limit must be a whole number of minor units, 0 or more."),
      );
    }
    if (errors.length > 0) return fail(errors);
    const limit: LivingLimit = { month: input.month, limitMinor: input.limitMinor };
    repos.livingLimits.upsert(limit);
    invalidateSnapshotsFrom(deps, [`${input.month}-01`]);
    return ok(limit);
  });
}

/** BR-6: suggested limit = the month's allocations to the first active bottle (Necessities), in base currency. */
export function getSuggestedLimit(deps: ServiceDeps, month: IsoMonth): Result<SuggestedLimit, FieldError> {
  const { repos } = deps;
  if (!MONTH_RE.test(month)) return fail([err("invalid-month", "month", "Month must be YYYY-MM.")]);
  const first = repos.bottles
    .list()
    .filter((b) => b.archivedAt === null)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (!first) return fail([err("no-bottles", "bottleId", "There are no active bottles.")]);
  return ok(
    suggestedLimit(
      month,
      first.id,
      repos.incomes.list(),
      repos.allocations.list(),
      repos.settings.get().baseCurrency,
      repos.exchangeRates.list(),
    ),
  );
}

// ---------- bottles ----------

function bottleNameError(deps: ServiceDeps, name: string, selfId?: Id): FieldError | null {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed === "") return err("empty-name", "name", "Name must not be empty.");
  const dup = deps.repos.bottles
    .list()
    .some((b) => b.id !== selfId && b.archivedAt === null && b.name.toLowerCase() === trimmed.toLowerCase());
  return dup ? err("duplicate-name", "name", "A bottle with this name already exists.") : null;
}

/** Add a bottle. It joins the split only after the next `editBottleRules` that gives it a ratio. */
export function addBottle(
  deps: ServiceDeps,
  input: { name: string; mascot: string },
): Result<Bottle, FieldError> {
  const { repos, clock } = deps;
  return atomic(deps, () => {
    const errors: Errors = [];
    const nameErr = bottleNameError(deps, input.name);
    if (nameErr) errors.push(nameErr);
    if (typeof input.mascot !== "string" || input.mascot.trim() === "")
      errors.push(err("empty-mascot", "mascot", "Pick a mascot."));
    if (errors.length > 0) return fail(errors);
    const bottles = repos.bottles.list();
    const bottle: Bottle = {
      id: clock.newId(),
      name: input.name.trim(),
      mascot: input.mascot.trim(),
      sortOrder: bottles.reduce((m, b) => Math.max(m, b.sortOrder), -1) + 1,
      archivedAt: null,
    };
    repos.bottles.create(bottle);
    return ok(bottle);
  });
}

export function renameBottle(deps: ServiceDeps, id: Id, name: string): Result<Bottle, FieldError> {
  const { repos } = deps;
  return atomic(deps, () => {
    const existing = repos.bottles.list().find((b) => b.id === id && b.archivedAt === null);
    if (!existing) return notFound("Bottle");
    const nameErr = bottleNameError(deps, name, id);
    if (nameErr) return fail([nameErr]);
    const bottle = renameBottleRule(existing, name);
    repos.bottles.update(bottle);
    return ok(bottle);
  });
}

/** Manual move of balance between two active bottles (base currency). Balances from `date` on change, so later snapshots are dropped. */
export function transferBetweenBottles(
  deps: ServiceDeps,
  input: { fromBottleId: Id; toBottleId: Id; amountMinor: number; date: IsoDate; note?: string | null },
): Result<BottleTransfer, FieldError> {
  const { repos, clock } = deps;
  return atomic(deps, () => {
    const errors: Errors = [];
    const active = repos.bottles.list().filter((b) => b.archivedAt === null);
    if (!active.some((b) => b.id === input.fromBottleId))
      errors.push(err("unknown-bottle", "fromBottleId", "Unknown or archived bottle."));
    if (!active.some((b) => b.id === input.toBottleId))
      errors.push(err("unknown-bottle", "toBottleId", "Unknown or archived bottle."));
    if (input.fromBottleId === input.toBottleId)
      errors.push(err("same-bottle", "toBottleId", "Pick two different bottles."));
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      errors.push(
        err("invalid-amount", "amountMinor", "Amount must be a positive whole number of minor units."),
      );
    }
    try {
      parseDate(input.date);
    } catch {
      errors.push(err("invalid-date", "date", `Invalid date: ${String(input.date)}`));
    }
    if (errors.length > 0) return fail(errors);
    const transfer: BottleTransfer = {
      id: clock.newId(),
      fromBottleId: input.fromBottleId,
      toBottleId: input.toBottleId,
      amountMinor: input.amountMinor,
      currency: repos.settings.get().baseCurrency,
      date: input.date,
      note: input.note?.trim() ? input.note.trim() : null,
    };
    repos.transfers.insert(transfer);
    invalidateSnapshotsFrom(deps, [transfer.date]);
    return ok(transfer);
  });
}
