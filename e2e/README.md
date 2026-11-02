# Browser smoke tests (QA)

Playwright (`playwright-core`) driving your **system Chrome** against the production app (`next start`)
on a throw-away SQLite database. Nothing touches `data/finance.db`.

```bash
npm run test:e2e                    # migrates + seeds a temp DB, builds, starts the app, runs the tests
E2E_SKIP_BUILD=1 npm run test:e2e   # reuse the existing .next build (faster while writing tests)
CHROME_PATH=/path/to/chrome npm run test:e2e   # non-default Chrome location
```

- `global-setup.ts` creates a temp dir with `DATABASE_URL`, runs `src/db/seed.ts`, builds, starts `next start` on a free port, and deletes the temp dir on exit.
- `support.ts` has the browser launcher, `newPage`, `trackErrors`, `hasHorizontalOverflow`, `basicA11y` (lang, title, one `h1`, `main`, accessible names, form labels, image alt, duplicate ids) and `tabAudit` (keyboard order + focus ring).
- Test files are `e2e/*.e2e.ts`, so the normal `npm test` (Vitest, `src/**`) never picks them up. They are not part of `npm run check`.

## What `flows.e2e.ts` covers

Quick add expense (defaults, server-side rejection keeps input, VND with rate), income from a pay-day link (5:1:1:1:1:1 split and slot recorded, checked in the temp DB), subscriptions (create, back-posted charges without duplicates, remove), Transactions filters / edit / delete, no horizontal overflow at 390px, basic a11y and keyboard order with visible focus on every screen, and a no-console-errors check per route.

Tests share one temp database and run in file order; they use unique notes (`e2e …`) and verify results through the UI and a read-only DB handle (`queryDb`).
