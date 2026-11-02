import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { seedDatabase } from "@/db/seed";
import type { ServiceDeps } from "../ports";

/** A migrated, seeded in-memory SQLite database wired to the real repositories. */
export function openSeeded(today = "2026-11-12") {
  const c = openDatabase(":memory:");
  migrate(c.db, { migrationsFolder: fileURLToPath(new URL("../../db/migrations", import.meta.url)) });
  seedDatabase(c.db);
  let n = 0;
  const repos = createRepositories(c.db);
  const deps: ServiceDeps = {
    repos,
    clock: { today: () => today, now: () => `${today}T10:00:00.000Z`, newId: () => `t-${++n}` },
  };
  const count = (table: string): number =>
    (c.sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
  return { deps, repos, close: () => c.sqlite.close(), count };
}

export type Seeded = ReturnType<typeof openSeeded>;

/** Look up seeded reference rows by name/type. */
export function refs(repos: Seeded["repos"]) {
  const category = (prefix: string) => {
    const c = repos.categories.list().find((x) => x.name.startsWith(prefix));
    if (!c) throw new Error(`no category ${prefix}`);
    return c;
  };
  const bottle = (name: string) => {
    const b = repos.bottles.list().find((x) => x.name === name);
    if (!b) throw new Error(`no bottle ${name}`);
    return b;
  };
  const method = (type: "cash" | "debit" | "credit") => {
    const p = repos.paymentMethods.list().find((x) => x.type === type);
    if (!p) throw new Error(`no payment method ${type}`);
    return p;
  };
  return { category, bottle, method };
}

export function unwrap<T>(r: { ok: true; value: T } | { ok: false; errors: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
}

export function errorCodes(r: { ok: boolean; errors?: { code: string }[] }): string[] {
  return r.ok ? [] : (r.errors ?? []).map((e) => e.code);
}
