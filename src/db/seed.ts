import { pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "./client";
import { migrationsDirectory } from "./config";
import * as s from "./schema";
import { initializeFirstUse } from "./first-use";

// Stable UUIDs make repeated seeds safe without overwriting user edits.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bottles = [
  ["Necessities", "nest"],
  ["Long-term Savings", "turtle-tuck"],
  ["Financial Freedom", "sprout"],
  ["Education", "owlie"],
  ["Play", "bun"],
  ["Give", "bee-kind"],
] as const;
const colors = ["#7C8C78", "#A3907A", "#8A9BAE", "#B59AA6", "#C2AE7E", "#8FA89C", "#A88C8C"] as const;
const categories = [
  ["Subscriptions", "subscription", false, 0],
  ["Groceries/Daily", "daily", true, 0],
  ["Dining out", "daily", true, 4],
  ["Transport", "daily", true, 0],
  ["Housing & Utilities", "other", true, 0],
  ["Health", "other", true, 0],
  ["Shopping", "daily", true, 4],
  ["Entertainment", "daily", true, 4],
  ["Tuition & Education", "other", false, 3],
  ["Gifts & Giving", "other", false, 5],
  ["Other", "other", true, 0],
] as const;

export function seedDatabase(
  db: ReturnType<typeof openDatabase>["db"],
  timezone = "America/Los_Angeles",
  now = new Date(),
) {
  db.transaction((tx) => {
    tx.insert(s.settings).values({ id: 1, timezone }).onConflictDoNothing().run();
    initializeFirstUse(tx, now);
    bottles.forEach(([name, mascot], i) => {
      tx.insert(s.bottle)
        .values({ id: uuid(i + 1), name, mascot, sort_order: i })
        .onConflictDoNothing()
        .run();
    });
    tx.insert(s.bottleRuleVersion)
      .values({
        id: uuid(100),
        effective_from: "1970-01-01T00:00:00.000Z",
        note: "Initial 5:1:1:1:1:1 rules",
      })
      .onConflictDoNothing()
      .run();
    bottles.forEach((_, i) => {
      tx.insert(s.bottleRuleRatio)
        .values({ version_id: uuid(100), bottle_id: uuid(i + 1), ratio: i === 0 ? 5 : 1 })
        .onConflictDoNothing()
        .run();
    });
    categories.forEach(([name, kind, counts_toward_living_limit, bottleIndex], i) => {
      tx.insert(s.category)
        .values({
          id: uuid(200 + i),
          name,
          kind,
          counts_toward_living_limit,
          default_bottle_id: uuid(bottleIndex + 1),
          color: colors[i % colors.length]!,
          mascot: bottles[bottleIndex][1],
        })
        .onConflictDoNothing()
        .run();
    });
    (["cash", "debit", "credit"] as const).forEach((type, i) => {
      tx.insert(s.paymentMethod)
        .values({
          id: uuid(300 + i),
          name: { cash: "Cash", debit: "Debit card", credit: "Credit card" }[type],
          type,
        })
        .onConflictDoNothing()
        .run();
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { db, sqlite } = openDatabase();
  try {
    migrate(db, { migrationsFolder: migrationsDirectory() });
    seedDatabase(db, Intl.DateTimeFormat().resolvedOptions().timeZone);
  } finally {
    sqlite.close();
  }
}
