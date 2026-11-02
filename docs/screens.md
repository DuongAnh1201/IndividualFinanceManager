# Screens

Owner: **codex1**. All screens consume domain functions/types; no business math in components.

| Screen | Contents |
|---|---|
| **Dashboard** | Penny greeting · month-to-date spend · living limit progress bar + "$X left · about $Y/day for N days" (or "$X over") · spend by category · bottle balances · upcoming subscriptions · pay-day banner |
| **Quick add** | Expense / Income toggle · amount + currency · category · payment method · date (today) · note · small "left to spend this month" line. Reachable in one tap from everywhere |
| **Transactions** | List of expenses & income · filter by period, category, payment method, bottle · edit / delete |
| **Subscriptions** | List, next charge date, monthly total · add / edit / remove (end) |
| **Income & Bottles** | Income list · per-bottle balance with mascot · allocation detail per income · transfer between bottles |
| **Reports** | Granularity switch **Week / Month / Year** · last 5 periods comparison charts · monthly summary report view · export CSV |
| **Settings** | Bottles & ratios editor (live %) · categories (living-limit toggle, bottle, mascot) · payment methods · currencies & exchange rates · pay days · living limit + warning level (50–99 %, default 80) · backup / restore |

## Charts (Reports)
Granularity: `week | month | year`, window: last 5 periods.
1. Spending by category — stacked bars.
2. Income vs spending — grouped bars.
3. Living limit vs actual — bars + limit line.
4. Payment method split (credit / debit / cash) for the selected period — donut.

## Spending alerts (in-app)
- After saving an expense (add or edit) that crosses a level (BR-6 crossing), the saved confirmation shows an alert with Penny's mood: warning → "Heads up: you're at 86 % of your living limit ($430 of $500)." · over → "You've gone over your living limit by $20." Uses `role="status"` (warning) / `role="alert"` (over); always with text, not colour only.
- No crossing → the normal "Expense added" message only.
