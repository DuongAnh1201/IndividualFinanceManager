# Individual Finance Manager (Cozy Coins)

A personal finance manager: expenses, monthly subscriptions, income split into bottles, a living limit, and week/month/year reports.
Your data stays on your computer in `data/finance.db`, which is git-ignored.

## Use it

```bash
npm install
npm run build && npm start   # http://localhost:3000 (or `npm run dev` while developing)
```

The database is created and seeded with default categories, bottles (5:1:1:1:1:1) and payment methods the first time the app opens.
To use a different file, set `DATABASE_URL=/path/to/finance.db`.

- **Quick add**: log an expense or income. Income is split into the bottles automatically.
- **Subscriptions**: added once, then posted every month on the billing day until you end them.
- **Pay days** (10 and 25 by default): Mochi's banner reminds you to log income. Browser notifications work while the app is open (or installed on your home screen).
- **Settings → Backup & export**: back up to `data/backups/`, export CSV, or restore a backup. A safety backup of your current data is always made first.

## Develop

```bash
npm run check      # lint + typecheck + unit/integration tests
npm run test:e2e   # browser tests (system Chrome, throw-away DB)
npm run db:seed    # create/seed the database explicitly
```

Project docs: [docs/README.md](docs/README.md). Team workflow: [AGENTS.md](AGENTS.md).
