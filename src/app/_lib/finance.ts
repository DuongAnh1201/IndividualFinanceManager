import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { seedDatabase } from "@/db/seed";
import type { ServiceDeps } from "@/services/ports";
import type { FormOptions } from "@/ui/finance/types";

/** One owned connection per request/action; local defaults only, never sample history. */
export function withFinance<T>(
  work: (deps: ServiceDeps & { repos: ReturnType<typeof createRepositories> }) => T,
): T {
  const { db, sqlite } = openDatabase();
  try {
    migrate(db, { migrationsFolder: join(process.cwd(), "src/db/migrations") });
    seedDatabase(db);
    const repos = createRepositories(db);
    const timezone = repos.settings.get().timezone;
    const clock = {
      now: () => new Date().toISOString(),
      newId: () => randomUUID(),
      today: () => {
        const parts = new Intl.DateTimeFormat("en", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date());
        const value = (type: string) => parts.find((p) => p.type === type)!.value;
        return `${value("year")}-${value("month")}-${value("day")}`;
      },
    };
    return work({ repos, clock });
  } finally {
    sqlite.close();
  }
}
export function formOptions({ repos, clock }: Parameters<Parameters<typeof withFinance>[0]>[0]): FormOptions {
  return {
    categories: repos.categories.list(),
    paymentMethods: repos.paymentMethods.list(),
    bottles: repos.bottles.list(),
    today: clock.today(),
    baseCurrency: repos.settings.get().baseCurrency,
  };
}
