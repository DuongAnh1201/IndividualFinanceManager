<!-- tomville:start -->
## Tomville

This project runs as a Tomville team office. The rules for agents:

- To prompt another agent, run `tmv send AGENT "text"`, not `herdr agent prompt`: it logs who sent the message.
- Lead only: keep `tmv watch` running in the background at all times. It polls every `[board] check_seconds` and exits on changes; handle them and restart it.
- Lead only: team PR → check conflicts, review/test and merge when ready; outside/fork/unverified PR → review and report to Tom via Telegram/email, never merge without Tom’s approval; new issue → label and assign, or ask Tom.
- Work items are GitHub issues. Use `tmv task new "title"`, `tmv task take N`, `tmv task move N review` and `tmv task list` instead of long `gh` commands.
<!-- tomville:end -->

## Project: Individual Finance Manager

A personal finance manager for Tom: expenses, subscriptions, income split into bottles, living limit, and reports.
**Read `docs/README.md` first.** `docs/` is the source of truth; if code and docs disagree, ask claude.

### Ownership
| agent | layer | folders |
|---|---|---|
| claude | lead: plan, docs, review, merge | `docs/`, root config |
| claude2 | business rules: subscriptions, bottles, pay-day reminders, shared types | `src/domain/` (+ owns `src/domain/types.ts`) |
| claude3 | business rules: expenses, living limit, reports, currency | `src/domain/` |
| codex1 | presentation: theme, mascots, screens, charts, notifications | `src/app/`, `src/ui/` |
| codex2 | database: schema, migrations, repositories, seed, backup | `src/db/` |

Stay in your folders. Need a change elsewhere (e.g. a new type in `types.ts`)? `tmv send` the owner, or note it in your PR.

### Workflow
1. Take the issue: `tmv task take N`.
2. Work in **your own git worktree**, never in the shared checkout:
   `git worktree add ../IFM-<agent> -b <agent>/<N>-<slug> origin/main`
3. Small commits; run `npm run lint && npm run typecheck && npm test` before pushing.
4. Open a PR that says `Closes #N`, then `tmv task move N review` and `tmv send claude "PR #X ready for #N"`.
5. **Only claude merges**, after review and tests. Address review comments on the same branch.

### Rules
- `src/domain/` is pure: no DB, no UI, no `Date.now()`; pass the date in. Every rule has unit tests.
- Money is integer minor units + currency. Never floats.
- Mascots and art are original. No copyrighted characters.
- Never commit `data/` (Tom's real finance data) or secrets.

### Logging
- Every message between agents goes through `tmv send` (logged to `.tomville/messages.jsonl`). No `herdr agent prompt`.
- Task status lives on GitHub issues via `tmv task`.
- Decisions go in `docs/decisions.md` (append-only, `D-NNN`).
- PR descriptions say what changed, how it was tested, and any open questions.
