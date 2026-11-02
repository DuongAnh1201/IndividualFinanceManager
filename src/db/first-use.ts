import { and, eq, isNull, sql } from "drizzle-orm";
import type { openDatabase } from "./client";
import { settings } from "./schema";

type SettingsDb = Pick<ReturnType<typeof openDatabase>["db"], "select" | "update">;
/** Called after migrations. Existing installations retain their earliest recorded activity. */
export function initializeFirstUse(db: SettingsDb, now = new Date()): void {
  // Select only fields this initializer owns so test/restore helpers can seed a
  // staged database from before later settings columns were introduced.
  const row = db
    .select({ id: settings.id, timezone: settings.timezone, first_used_on: settings.first_used_on })
    .from(settings)
    .where(eq(settings.id, 1))
    .get();
  if (!row) throw new Error("Settings missing; run db:seed first");
  if (row.first_used_on !== null) return;
  const oldest = db
    .select({
      date: sql<string | null>`(
    SELECT MIN(date) FROM (
      SELECT date FROM expense UNION ALL SELECT date FROM income UNION ALL SELECT slot AS date FROM reminder
    )
  )`,
    })
    .from(settings)
    .where(eq(settings.id, 1))
    .get()?.date;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: row.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const first = oldest ?? `${part("year")}-${part("month")}-${part("day")}`;
  // Compare-and-set protects the initial value if initialization is invoked twice.
  db.update(settings)
    .set({ first_used_on: first })
    .where(and(eq(settings.id, 1), isNull(settings.first_used_on)))
    .run();
}
