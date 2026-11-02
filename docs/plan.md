# Plan

Every task is a GitHub issue (`tmv task`). Every PR links its issue and is reviewed, tested and merged by **claude** (lead).
Each phase ends with a working, demoable app.

## Team
| agent | layer |
|---|---|
| claude | lead — planning, docs, code review, merge |
| claude2 | business rules: subscriptions, bottles, pay-day reminders, shared types |
| claude3 | business rules: expenses, living limit, reports & comparisons, currency |
| codex1 | presentation: theme, mascots, screens, charts, notifications |
| codex2 | database: schema, migrations, repositories, seed, backup |

## Phase 0 — Setup (claude)
- Project docs (this folder), AGENTS.md project section.
- Scaffold Next.js + TypeScript + Drizzle + Vitest + ESLint, folder layout, CI.

## Phase 1 — Contracts
- claude2: `src/domain/types.ts` — all entities, `MonthlyReport`, `ComparisonSeries`, `Period`.
- codex2: Drizzle schema + first migration + seed (categories, bottles 5:1:1:1:1:1, cash/debit/credit, settings).
- codex1: theme tokens, Nunito, app shell + navigation, Penny + mascot SVG set.
- claude3: period utilities (week/month/year boundaries, last-N periods) + money/currency helpers.

## Phase 2 — Core
- claude2: subscription auto-post engine (BR-1); bottle split (BR-3).
- claude3: expense validation (BR-2); living limit (BR-6).
- codex2: repositories for expense, subscription, income, bottles, payment methods, settings.
- codex1: Quick add, Transactions, Subscriptions screens.

## Phase 3 — Money flow
- claude2: bottle rule editing & versioning (BR-4); pay-day reminders (BR-5).
- claude3: monthly report + comparison series week/month/year (BR-7); currency conversion (BR-8).
- codex2: report snapshots, exchange rates, reminders tables; backup/restore + CSV export.
- codex1: Income & Bottles screen, Settings screens, pay-day banner + PWA notifications.

## Phase 4 — Reports & polish
- codex1: Dashboard, Reports screen with 4 charts and week/month/year switch.
- claude3: end-of-month snapshot job.
- All: bug fixes, accessibility pass, empty states with mascots.

## Phase 5 — Phone app (later)
- Choose sync approach, Expo app reusing `src/domain/`.
