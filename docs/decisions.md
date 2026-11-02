# Decisions log

Append-only. Format: `D-NNN — date — decision — why`. Anyone may propose; Tom or claude (lead) records.

- **D-001 — 2026-11-01** — Web app first, phone app later. — Tom's choice.
- **D-002 — 2026-11-01** — TypeScript + Next.js + SQLite (Drizzle), local-only data. — Private, simple, portable to Postgres for phone sync.
- **D-003 — 2026-11-01** — Money as integer minor units + ISO currency. — No float rounding errors.
- **D-004 — 2026-11-01** — Bottles default 5:1:1:1:1:1, editable, versioned; edits affect future income only; rounding remainder to first bottle. — Tom's rule; reproducible history.
- **D-005 — 2026-11-01** — Living limit counts only categories flagged `counts_toward_living_limit` (Tuition excluded). — Tom's rule.
- **D-006 — 2026-11-01** — Pay days 10 and 25 with in-app + PWA notifications. — Tom's paydays.
- **D-007 — 2026-11-01** — Base currency USD; second currency **VND (assumed, Tom to confirm)**. — Tom wrote "option in USD", likely meant VND.
- **D-008 — 2026-11-01** — Charts support week / month / year, last 5 periods. — Tom's request.
- **D-009 — 2026-11-01** — Cute neutral theme with **original** mascots only (no copyrighted characters). — Tom wants cartoon characters; avoid IP issues.
- **D-010 — 2026-11-01** — Domain layer is pure (no I/O, date injected). — Testable and reusable by the phone app.
- **D-011 — 2026-11-01** — TS types use camelCase; DB columns use snake_case; mapping happens only in `src/db/` repositories. — Idiomatic on both sides, single mapping point.
- **D-012 — 2026-11-01** — `Period = { granularity: 'week'|'month'|'year'; id: string; start: IsoDate; end: IsoDate }`, **half-open** `[start, end)`. Ids: week = its start date `YYYY-MM-DD`, month = `YYYY-MM`, year = `YYYY`. Types in `types.ts` (claude2), functions in `period.ts` (claude3). — Week ids stay unambiguous for any week start day; half-open makes string comparison simple.
- **D-013 — 2026-11-01** — Currency exponents: USD 2, VND 0 (ISO 4217); list is extensible. Money ops throw on currency mismatch; conversion without a rate returns a "missing rate" result. — Matches BR-8.
- **D-014 — 2026-11-01** — Date math helpers (`daysInMonth`, `clampDay`, `monthOf`) live once in `period.ts` (claude3); BR-1 imports them. — No duplicated date logic.
- **D-015 — 2026-11-01** — Every `IsoTimestamp` is UTC in `Date.prototype.toISOString()` format (`YYYY-MM-DDTHH:mm:ss.sssZ`). — Timestamps are compared as strings (e.g. `activeRuleVersion`); mixed formats would order wrongly.
- **D-016 — 2026-11-01** — Bottle rule ratios are always ordered by `bottle.sortOrder`; the split remainder goes to `ratios[0]` (Necessities by default). — Deterministic remainder.
- **D-017 — 2026-11-01** — Subscriptions: a charge date before `startDate` is not owed; missed months are caught up at the current price (no price history); a charge on the `endDate` day is still owed. "Remove" sets `endDate` = today. — Simple, predictable for a personal app.
- **D-018 — 2026-11-01** — If a category's default bottle is archived, a new expense gets `bottleId = null` (no error). Removing a bottle repoints its categories to the transfer-target bottle. — Never block logging spending because of a settings issue.
- **D-019 — 2026-11-01** — An `approver` agent (codex) answers routine permission prompts of the worker agents; credentials and risky/irreversible actions are escalated to claude. — Tom's request, to keep workers unblocked.
- **D-020 — 2026-11-02** — When an agent hits its usage limit, its work moves to an available agent (Tom's instruction). The lead commits and pushes the agent's WIP to its feature branch first, then relabels the issue. Ownership exceptions for the new agent are noted in its PR. — Codex (codex1, codex2, approver) and then Claude workers hit limits mid-phase; no work was lost.
- **D-021 — 2026-11-02** — The e2e suite shares one throw-away DB and runs files in a fixed alphabetical order (custom Vitest sequencer). Tests needing past dates backdate `settings.first_used_on` in the test DB. — The default sequencer reordered files by cached duration, and phase3 depends on flows' data.
- **D-022 — 2026-11-02** — Chart series colours are distinct among the visible series. A category whose colour clashes takes the next unused palette colour. — 11 categories cycle a 7-colour palette.
