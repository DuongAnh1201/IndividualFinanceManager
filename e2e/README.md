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
