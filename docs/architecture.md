# Architecture

## Stack
- **TypeScript** everywhere, **Next.js** (App Router) web app, runs locally, installable PWA.
- **SQLite** via **Drizzle ORM** (file `data/finance.db`, git-ignored). Portable to Postgres/Turso later.
- **Vitest** for unit tests, **ESLint + Prettier**, GitHub Actions CI (lint, typecheck, test).
- Charts: **Recharts**.

## Layers & ownership
```
src/
  domain/      business rules — pure functions, no I/O          claude2, claude3
    types.ts   shared types (the contract between layers)        claude2 (claude3 reviews)
  db/          schema, migrations, repositories, seed            codex2
  app/         Next.js routes, server actions                    codex1
  ui/          components, theme tokens, mascots, charts         codex1
data/          local SQLite file (git-ignored)
docs/          project docs                                      claude (lead)
```

Dependency direction: `app/ui → domain ← db`. `domain` imports nothing from `db`, `app` or `ui`.
Server actions in `app/` load data via `db/` repositories, call `domain/` rules, and persist results via `db/`.

## Phone app (later)
React Native / Expo reusing `src/domain/`. Sync options decided then: hosted DB vs local DB + private cloud sync.
