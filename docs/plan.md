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

## Phase 0 — Setup (claude) ✅ done (#1, #7)
- Project docs (this folder), AGENTS.md project section.
- Scaffold Next.js + TypeScript + Drizzle + Vitest + ESLint, folder layout, CI.

## Phase 1 — Contracts ✅ done (#8–#10, #19, #26)
- claude2: `src/domain/types.ts` — all entities, `MonthlyReport`, `ComparisonSeries`, `Period`.
- codex2: Drizzle schema + first migration + seed (categories, bottles 5:1:1:1:1:1, cash/debit/credit, settings).
- codex1: theme tokens, Nunito, app shell + navigation, Penny + mascot SVG set.
- claude3: period utilities (week/month/year boundaries, last-N periods) + money/currency helpers.

## Phase 2 — Core ✅ done (#11, #12, #17, #20, #41, #46)
- claude2: subscription auto-post engine (BR-1); bottle split (BR-3).
- claude3: expense validation (BR-2); living limit (BR-6).
- codex2: repositories for expense, subscription, income, bottles, payment methods, settings.
- codex1: Quick add, Transactions, Subscriptions screens.

## Phase 3 — Money flow ✅ done (#21, #27, #29, #30, #39, #47, #50, #54, #56)
- claude2: bottle rule editing & versioning (BR-4); pay-day reminders (BR-5).
- claude3: monthly report + comparison series week/month/year (BR-7); currency conversion (BR-8).
- codex2: report snapshots, exchange rates, reminders tables; backup/restore + CSV export.
- codex1: Income & Bottles screen, Settings screens, pay-day banner + PWA notifications.

## Phase 4 — Reports & polish ✅ done (#38, #42, #45, #51, #55)
- codex1: Dashboard, Reports screen with 4 charts and week/month/year switch.
- claude3: end-of-month snapshot job.
- All: bug fixes, accessibility pass, empty states with mascots.

## Phase 4.5 — In-app spending alerts ⏳ in progress
- claude3: BR-6 configurable warning level, `limitCrossing`, `remainingAllowance`; expense services report the crossing.
- codex2: `settings.limit_warning_percent` migration + repository + backup compatibility.
- codex1: alert on expense save, left-to-spend lines, warning level in Settings.

## Future milestone — Spending alerts: notifications & email ⏳ not started
- Browser (PWA) notification once per month when crossing warning and over, reusing the local pay-day notification path.
- Optional email alerts. Needs a mail provider + credentials (Tom decides; secrets never committed) and an opt-in setting. Data stays local; only the alert text is sent.

## Phase 5 — Phone app (later) ⏳ not started
- Choose sync approach, Expo app reusing `src/domain/`.

## Status (2026-11-02)
The web app is feature-complete for phases 0–4: Quick add, Transactions, Subscriptions (auto-post), Income & Bottles (5:1:1:1:1:1, editable),
Settings (categories, payment methods, FX, pay days, living limit), Dashboard, Reports (week/month/year, last 5), backup/restore/CSV, PWA and pay-day banner.
Test coverage: unit + service integration (`npm run check`) and browser flows (`npm run test:e2e`). Remaining: phase 4.5 (in-app spending alerts), the notifications & email milestone, then phase 5.

