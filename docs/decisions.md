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
