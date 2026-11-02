# Business rules

Lives in `src/domain/` — **pure TypeScript, no UI, no DB, no `Date.now()` inside rules**
(the current date is passed in). Every rule below must have unit tests.

Owners: **claude2** (BR-1, BR-3, BR-4, BR-5) · **claude3** (BR-2, BR-6, BR-7, BR-8).

## BR-1 Subscriptions auto-post (claude2)
- On app start and once a day, for each subscription where `start_date ≤ today` and (`end_date` is null or `≥` charge date):
  create one expense per **owed billing month** up to today, with `source = subscription`.
- Charge date = `billing_day` in that month, **clamped to the last day** (31 → Feb 28/29).
- A month is owed once `today ≥ charge date`.
- **Idempotent**: never post twice for the same `(subscription_id, billing_month)`. Catches up missed months.
- **Remove** = set `end_date`; past expenses stay; no future posts.
- **Price change** applies to charges posted after the change only.

## BR-2 Expenses (claude3)
- `amount > 0`, valid category and payment method, known currency.
- `bottle_id` defaults to the category's `default_bottle_id`.
- Non-base currency requires an FX rate (per-transaction or the month's `exchange_rate`).

## BR-3 Income & bottle split (claude2)
- Saving an income splits it with the **active bottle rule version** at that time.
- `share_i = floor(amount × ratio_i / Σ ratios)`; the **remainder goes to the first bottle** (Necessities by default) so shares sum exactly to the income.
- Income in VND is split in VND; balances are reported in base currency.

## BR-4 Bottle rules editing (claude2)
- Rename / add / remove bottles; ratios are positive integers (shown as % live).
- Editing creates a **new rule version**; existing allocations are never changed.
- Optional manual **re-split** of a single past income with the current rules.
- Removing a bottle with a non-zero balance requires choosing a target bottle → a `bottle_transfer`.

## BR-5 Pay-day reminders (claude2)
- Pay days from settings (default 10 and 25). A reminder slot is due when `today ≥ pay day` in the current month.
- A slot is **done** once an income is logged with that `pay_day_slot` (or any income dated within the slot's window, until the next pay day). User may dismiss.
- Missed slots stay visible until resolved.
- Delivery (presentation layer): in-app banner + PWA/browser notification; native notification on phone later.

## BR-6 Living limit (claude3)
- One limit per month, base currency.
- Only categories with `counts_toward_living_limit = true` count (Tuition does not).
- Status: `ok` < W ≤ `warning` < 100 % ≤ `over`, where W = `settings.limitWarningPercent` (integer 50–99, default 80). Integer math only.
- **Crossing** (`limitCrossing(before, after)`): compares the month's status before and after a write. Returns `over` if it moved into `over`, `warning` if it moved from `ok` into `warning`, else `null` (no alert when going down, staying level, or across months).
- **Remaining allowance** (`remainingAllowance(status, today)`): `leftMinor = limit − spent` (negative when over). For the current month only: `daysLeft` = days from today through the month's last day inclusive; `perDayMinor = floor(leftMinor / daysLeft)` when `leftMinor > 0`, else 0. For a past/future month `daysLeft` and `perDayMinor` are `null`.
- Suggested limit = that month's Necessities allocations (user can override). Carries forward from last month if not set.

## BR-7 Reports & comparison (claude3)
- **Monthly report** (`MonthlyReport`): total spend, by category, by payment method (credit vs debit vs cash),
  subscriptions vs daily, income total, bottle allocations & balances, living limit status, top 5 expenses,
  delta vs previous month.
- Current month = live; a month's snapshot is saved on the first app open after it ends.
- **Comparison series** for granularity `week | month | year`, last **5** periods (configurable), returning
  per-period totals by category, income vs spending, living limit vs actual.
- Weeks start on `settings.week_starts_on` (Monday default). Years are calendar years.

## BR-8 Currency (claude3)
- Store original amount + currency. Convert to base with the transaction's `fx_rate_to_base`,
  else the month's `exchange_rate`, else flag as "missing rate" (never silently treat as 1).
- Rounding: convert per transaction, round half-even to base minor units, then sum.
