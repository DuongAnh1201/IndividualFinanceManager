import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./client";
import { seedDatabase } from "./seed";
import * as s from "./schema";

const connections: ReturnType<typeof openDatabase>[] = [];
const directories: string[] = [];
function setup(path = ":memory:") {
  const connection = openDatabase(path);
  connections.push(connection);
  migrate(connection.db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
  return connection;
}
afterEach(() => {
  connections.splice(0).forEach(({ sqlite }) => sqlite.close());
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true }));
});
describe("database migration and seed", () => {
  it("migrates twice and seeds repeatably without resetting settings", () => {
    const { db, sqlite } = setup();
    seedDatabase(db, undefined, new Date("2026-11-12T20:00:00Z"));
    db.update(s.settings).set({ timezone: "Asia/Ho_Chi_Minh" }).run();
    migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
    seedDatabase(db, undefined, new Date("2027-05-01T00:00:00Z")); // later seed must not move first use
    expect(db.select().from(s.settings).all()).toEqual([
      {
        id: 1,
        base_currency: "USD",
        pay_days: [10, 25],
        week_starts_on: 1,
        timezone: "Asia/Ho_Chi_Minh",
        first_used_on: "2026-11-12", // 20:00Z is still Nov 12 in Los Angeles (seed zone)
      },
    ]);
    expect(db.select().from(s.bottle).all()).toHaveLength(6);
    expect(db.select().from(s.category).all()).toHaveLength(11);
    expect(
      db
        .select()
        .from(s.paymentMethod)
        .all()
        .map((row) => row.type)
        .sort(),
    ).toEqual(["cash", "credit", "debit"]);
    expect(
      db
        .select()
        .from(s.bottleRuleRatio)
        .all()
        .map((row) => row.ratio)
        .sort(),
    ).toEqual([1, 1, 1, 1, 1, 5]);
    const mappings = sqlite
      .prepare(
        "SELECT c.name, b.name AS bottle, c.counts_toward_living_limit AS living FROM category c JOIN bottle b ON b.id = c.default_bottle_id",
      )
      .all();
    expect(mappings).toContainEqual({ name: "Tuition & Education", bottle: "Education", living: 0 });
    expect(mappings).toContainEqual({ name: "Dining out", bottle: "Play", living: 1 });
    expect(mappings).toContainEqual({ name: "Subscriptions", bottle: "Necessities", living: 0 });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });
  it("enforces foreign keys, singleton, positive integer money and billing uniqueness", () => {
    const { db, sqlite } = setup();
    seedDatabase(db);
    const category = db.select().from(s.category).all()[0]!;
    const method = db.select().from(s.paymentMethod).all()[0]!;
    const sub = {
      id: "sub",
      name: "Test",
      amount_minor: 100,
      currency: "USD" as const,
      category_id: category.id,
      payment_method_id: method.id,
      billing_day: 31,
      start_date: "2026-01-01",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    db.insert(s.subscription).values(sub).run();
    for (const amount_minor of [-1, 0, 1.5])
      expect(() =>
        db
          .insert(s.subscription)
          .values({ ...sub, id: String(amount_minor), amount_minor })
          .run(),
      ).toThrow();
    expect(() =>
      db
        .insert(s.subscription)
        .values({ ...sub, id: "bad-fk", category_id: "missing" })
        .run(),
    ).toThrow();
    expect(() => db.insert(s.settings).values({ id: 2, timezone: "UTC" }).run()).toThrow();
    const expense = {
      id: "expense",
      date: "2026-01-31",
      amount_minor: 100,
      currency: "USD" as const,
      category_id: category.id,
      payment_method_id: method.id,
      source: "subscription" as const,
      subscription_id: sub.id,
      billing_month: "2026-01",
      created_at: sub.created_at,
      updated_at: sub.updated_at,
    };
    db.insert(s.expense).values(expense).run();
    expect(() =>
      db
        .insert(s.expense)
        .values({ ...expense, id: "duplicate" })
        .run(),
    ).toThrow();
    db.insert(s.expense)
      .values({ ...expense, id: "vnd", currency: "VND", amount_minor: 25000, billing_month: "2026-02" })
      .run();
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });
  it("persists migrations and seed in an isolated file database", () => {
    const directory = mkdtempSync(join(tmpdir(), "ifm-db-"));
    directories.push(directory);
    const path = join(directory, "nested", "finance.db");
    seedDatabase(setup(path).db);
    const { db } = setup(path);
    expect(db.select().from(s.category).all()).toHaveLength(11);
  });
  it("first use is the local date in the saved timezone, set once", () => {
    const { db } = setup();
    // 2026-11-12T03:00Z is Nov 11 in Los Angeles but Nov 12 in Ho Chi Minh.
    seedDatabase(db, "Asia/Ho_Chi_Minh", new Date("2026-11-12T03:00:00Z"));
    expect(db.select().from(s.settings).get()?.first_used_on).toBe("2026-11-12");
    seedDatabase(db, "America/Los_Angeles", new Date("2030-01-01T00:00:00Z"));
    expect(db.select().from(s.settings).get()?.first_used_on).toBe("2026-11-12");
  });

  it("existing installs without a first-use date backfill to their earliest recorded activity", () => {
    const { db, sqlite } = setup();
    seedDatabase(db, "UTC", new Date("2026-11-12T00:00:00Z"));
    sqlite.prepare("UPDATE settings SET first_used_on = NULL").run();
    sqlite
      .prepare(
        "INSERT INTO reminder (slot, status, resolved_at) VALUES ('2026-08-10', 'dismissed', '2026-08-11T00:00:00.000Z')",
      )
      .run();
    seedDatabase(db, "UTC", new Date("2026-11-12T00:00:00Z"));
    expect(db.select().from(s.settings).get()?.first_used_on).toBe("2026-08-10");
  });
});
