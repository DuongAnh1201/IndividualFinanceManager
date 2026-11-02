# Requirements — Individual Finance Manager

Owner: Tom. Approved: 2026-11-01.

## Goal
A personal finance manager for one person (Tom) to see **where money goes every month**,
split income into savings bottles, and get a **summary report at the end of each month**.

## Platforms
1. **Web app first** — runs locally on Tom's machine, installable as a PWA (home-screen icon, notifications).
2. **Phone app later** — reuses the business-rules layer (`src/domain/`). Sync strategy decided in that phase.

## Data & privacy
- All data is stored **locally** in one SQLite file (`data/finance.db`), never committed to git.
- One-click **Backup/Export** (DB copy + CSV) and **Restore**.

## Features

### Spending
- **Expenses** entered manually (Groceries/Daily, Dining, Transport, …): amount, category, date (default today), payment method, optional note.
- **Monthly subscriptions** are auto-added every month until removed.
- **Payment methods**: credit card, debit card, cash. Every expense/subscription has one.
- **Categories**: defaults provided, user can add/rename/archive.

### Income & bottles
- **Track income**: date, amount, currency, source, note.
- **Pay days: 10th and 25th** of every month (configurable). On those days, a reminder to log the income received.
- **Bottles (jars)**: every income is split automatically. Default ratio **5:1:1:1:1:1**.
- **Bottle rules are editable**: rename, add, remove bottles; change ratios. Changes apply to future income only.

### Living limit
- A **monthly limit for daily living expenses only**. Categories opt in (e.g. Groceries yes, Tuition no).
- Warning at 80 % (Tom can change it, 50–99 %), alert when exceeded.
- **In-app alerts (now):** when a saved expense pushes the month past the warning level or past 100 %, the confirmation says so right away. Dashboard and Quick add show what is left to spend this month and a per-day amount.
- **Notification / email alerts (future milestone "Spending alerts: notifications & email"):** browser notification once per month at warning and at over; optional email alerts. Not built yet.

### Reports & charts
- **Monthly summary report**: totals, by category, subscriptions vs daily, by payment method, income vs spending, bottle balances, top expenses, change vs previous month.
- **Comparison charts** with selectable granularity: **week / month / year**, comparing the **last 5 periods**.

### Currency
- Base currency **USD**. Second currency **VND** (assumed — see decisions D-007). Each amount is stored in its original currency; reports convert to USD.

### Look & feel
- Neutral mid-tone palette — not too dark, not too light.
- **Cute**, with original cartoon mascot characters. See [theme.md](theme.md).

## Out of scope (for now)
- Bank syncing / CSV import from banks
- Multi-user accounts
- Phone app (phase 5)
