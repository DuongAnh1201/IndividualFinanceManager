# Database

SQLite rows use snake_case. Repositories map rows to camelCase domain types.
Amounts are integer minor units: USD cents (exponent 2), VND đồng (exponent 0).
Calendar dates and months are text; timestamps are UTC `toISOString()` strings.

`DATABASE_URL` selects the SQLite file (default `data/finance.db`) via `config.ts`.
`openDatabase(":memory:")` or an explicit temporary path isolates tests. The caller
owns the returned SQLite connection and must close it. Foreign keys are enabled
for every connection opened by this helper.

Run `npm run db:migrate` to apply checked-in migrations. Run `npm run db:seed` to
migrate and seed in one command. Run `npm run db:generate` after schema edits and
commit the SQL plus Drizzle metadata.

The seed inserts defaults in a transaction using stable UUIDs and conflict-ignore
inserts; rerunning it preserves edited defaults. It does not create transactions,
income, limits, subscriptions, or sample financial history. Settings initially use
the machine timezone when run via CLI; `seedDatabase(db, timezone)` accepts an
explicit initial zone (its default is America/Los_Angeles for deterministic tests).
The initial ratio version starts at `1970-01-01T00:00:00.000Z` so it applies to
historical income too. The default bottle ratios are 5:1:1:1:1:1 in bottle sort order.

## Synchronous repository API

```ts
import { openDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";

const { db, sqlite } = openDatabase();
const repos = createRepositories(db);
// Run migrations and seed before serving requests; close sqlite on shutdown.
```

Every method is synchronous. List results contain domain objects, including
archived rows by default; getters return `undefined` when no row exists.
`settings.get()` requires the singleton and throws when the DB has not been seeded.
Dates are local calendar strings; supplied timestamps are normalized to UTC
`toISOString()` format before storage. Call domain validation/calculation functions
before writes. Repositories persist the resulting values rather than recomputing
business rules or defaulting a deliberately null bottle.

| Repository                                | Methods                                                                                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories`, `paymentMethods`, `bottles` | `list(includeArchived = true)`, `active()`, `get(id)`, `create(value)`, `update(value)`, `archive(id, now)`                                                                                                      |
| `bottles`                                 | Also `rename(id, name)`; lists ordered by `sortOrder`, then ID                                                                                                                                                   |
| `expenses`                                | `get(id)`, `list(filter?)`, `insert(value)`, `insertMany(values)`, `update(value)`, `delete(id)`, `postedChargeKeys(subscriptionId?)`                                                                            |
| `subscriptions`                           | `list()`, `get(id)`, `create(value)` (alias `insert`), `update(value)`, `updatePrice(id, money, now)`, `end(id, date, now)`                                                                                      |
| `incomes`                                 | `list(range?)`, `get(id)`, `insert(value, allocations?)`, `update(value, allocations?)`, `delete(id)`, `replaceAllocations(income, allocations)`, `allocationsByIncomeIds(ids)`, `allocationsByDateRange(range)` |
| `allocations`                             | `list()`, `insertMany(rows)`, `replaceForIncome(incomeId, rows)`, `deleteForIncome(incomeId)`                                                                                                                    |
| `ruleVersions`                            | `list()`, `latest(at?)`, `insert(version)`; ratios ordered by bottle sort order, including archived bottles                                                                                                      |
| `transfers`                               | `list(range?)`, `insert(value)`                                                                                                                                                                                  |
| `settings`                                | `get()`, `update(value)`                                                                                                                                                                                         |
| `exchangeRates`                           | `get(month, currency)`, `list(months?)`, `upsert(value)`                                                                                                                                                         |
| `livingLimits`                            | `get(month)`, `list()`, `upsert(value)`                                                                                                                                                                          |
| `reminders`                               | `list()`, `upsert(value)`                                                                                                                                                                                        |
| `monthlyReports`                          | `get(month)`, `months()`, `upsert(month, report, generatedAt)`                                                                                                                                                   |

`range` is `{ start, end }`, interpreted as half-open `[start, end)`.
Expense filters accept optional `start`, `end`, `categoryId`, `paymentMethodId`,
`bottleId`, and `source`. Lists have deterministic chronological/name ordering;
lookup bottle ordering uses `sortOrder`.

`expenses.insertMany` is transactional and skips only conflicts on
`(subscription_id, billing_month)`, returning the rows actually inserted.
Other constraint failures throw and roll back the batch. `postedChargeKeys`
returns a `Set<string>` of `subscriptionId|YYYY-MM` keys for BR-1.
Expense/subscription updates preserve their original creation timestamps.

`incomes.insert/update(value, allocations)` atomically persist the income and
allocation rows. Combined writes require allocations belonging to the income and
summing exactly to its amount. Income deletion removes allocations atomically.
`replaceAllocations` accepts the domain re-split's income with a new version ID;
it preserves the other income fields. Lower-level one-argument income writes and
`allocations.insertMany` are provided for service orchestration and must be grouped
in a transaction when used together.

Use `repos.transaction(() => { ... })` for multi-repository service operations.
The callback takes no arguments, uses the same repos object, and returns its value.
Nested calls join the outer transaction; let errors propagate to roll back all
writes. Keep callbacks synchronous and do not catch persistence errors inside an
outer transaction. Use one repository factory per connection.

`repos.applyBottleRemoval(result)` accepts the domain `RemoveBottleResult` and
atomically archives the bottle, inserts its optional transfer, updates changed
category defaults, and inserts the new immutable rule version and ratios. Existing
versions and historical allocations stay intact.

## Currency migration

Migration `0001` adds currency CHECK constraints for USD/VND to expenses,
subscriptions, incomes, transfers, exchange rates and settings, plus report-query
indexes on expense date/category and income date. It preserves dependent expense
and allocation rows in temporary tables during parent-table rebuilds, then
restores them before commit. Foreign keys remain enabled; the whole migration is
transactional, and unsupported existing currency values cause rollback.

Seed palette and payment-method refinements apply to fresh inserts. Re-seeding an
existing database intentionally preserves edited/default rows already present.

## Managed live connection and maintenance

Server code uses `withDatabase(repos => synchronousWork)` from `@/db/holder`.
The holder lazily opens, migrates and seeds one live connection (machine timezone
for initial settings). `getDb()` and `getRepositories()` are also available, but
obtain them per request and never cache their results in another module. Requests
do not close the shared connection; `closeDatabase()` is for shutdown/tests.

**Integration required in codex1's #16 or #25:** update
`src/app/_lib/finance.ts` so `withFinance(work)` wraps its clock construction and
`work({ repos, clock })` in `withDatabase(repos => ...)`, replacing its own
open/migrate/seed/close lifecycle. No service function changes are needed because
services receive repositories for each call. Settings actions call the maintenance
functions outside `withFinance`/`withDatabase`. Do not enable Restore before all
server entrypoints use the holder; independent request connections bypass its gate.

Import `backupDatabase`, `restoreDatabase`, `validateBackup`, and `exportCsv` from
`@/db/backup`:

- `await backupDatabase(destinationFile?)` returns an absolute snapshot path. It
  uses SQLite's backup API, including committed WAL data. The default is a unique
  file in `backups/` beside the configured DB (normally git-ignored `data/backups`).
- `await restoreDatabase(sourceFile)` returns `{ databasePath, safetyBackupPath }`.
  It validates and stages a standalone snapshot, automatically backs up the live
  data, checkpoints/closes the live connection, atomically replaces its file, and
  reopens the holder. New requests use fresh repositories. Validation, staging,
  safety-backup, and checkpoint failures leave the live DB unchanged. A failed
  rename reopens the original. The automatic safety copy remains available.
- `validateBackup(sourceFile)` opens read-only and requires the exact shipped
  schema and migration history, SQLite integrity, valid foreign keys, and usable
  settings. Backups from incompatible app versions are rejected without modifying
  them; restore does not silently migrate a user's backup.
- `exportCsv(directory?)` returns `{ directory, expensesPath, incomesPath }`. It
  reads expenses, incomes and all lookups in one transaction and passes them to
  the domain CSV serializers. Default exports use a new directory under
  `data/backups`. CSV quoting, currency decimals and formula guards remain in
  `src/domain/csv.ts`.

Backup and restore use a process-local exclusive gate across asynchronous SQLite
copy operations. `withDatabase`, direct holder getters and other maintenance calls
throw `DatabaseBusyError` while it is held; callers can report a retryable busy
state. Keep request callbacks synchronous. Restore cannot run inside a request
callback or repository transaction. All app access must share this holder in one
server process; close any external DB tools before restoring. Restore requires a
file-backed DB; backups support in-memory databases with an explicit destination.

Output files have mode 0600; export directories and temporary staging directories
are private. Existing backup files/export directories are never overwritten.
Within the checkout, output is restricted to git-ignored `data/`, including after
resolving symlinked ancestors. An explicit path outside the checkout is supported.
Tests use temporary directories and never read or modify Tom's finance database.
