# Screens

Owner: **codex1**. All screens consume domain functions/types; no business math in components.

| Screen | Contents |
|---|---|
| **Dashboard** | Penny greeting · month-to-date spend · living limit progress bar · spend by category · bottle balances · upcoming subscriptions · pay-day banner |
| **Quick add** | Expense / Income toggle · amount + currency · category · payment method · date (today) · note. Reachable in one tap from everywhere |
| **Transactions** | List of expenses & income · filter by period, category, payment method, bottle · edit / delete |
| **Subscriptions** | List, next charge date, monthly total · add / edit / remove (end) |
| **Income & Bottles** | Income list · per-bottle balance with mascot · allocation detail per income · transfer between bottles |
| **Reports** | Granularity switch **Week / Month / Year** · last 5 periods comparison charts · monthly summary report view · export CSV |
| **Settings** | Bottles & ratios editor (live %) · categories (living-limit toggle, bottle, mascot) · payment methods · currencies & exchange rates · pay days · living limit · backup / restore |

## Charts (Reports)
Granularity: `week | month | year`, window: last 5 periods.
1. Spending by category — stacked bars.
2. Income vs spending — grouped bars.
3. Living limit vs actual — bars + limit line.
4. Payment method split (credit / debit / cash) for the selected period — donut.
