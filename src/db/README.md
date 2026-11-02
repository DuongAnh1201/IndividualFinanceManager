# Database

SQLite rows use snake_case. Phase 2 repositories map rows to the camelCase domain types.
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
America/Los_Angeles; `seedDatabase(db, timezone)` accepts an alternate initial zone.
The initial ratio version starts at `1970-01-01T00:00:00.000Z` so it applies to
historical income too. The default bottle ratios are 5:1:1:1:1:1 in bottle sort order.
