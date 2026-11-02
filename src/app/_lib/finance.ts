import { randomUUID } from "node:crypto";
import { withDatabase } from "@/db/holder";
import type { createRepositories } from "@/db/repositories";
import type { ServiceDeps } from "@/services/ports";
import type { FormOptions } from "@/ui/finance/types";

type FinanceContext = ServiceDeps & { repos: ReturnType<typeof createRepositories> };

/** Obtain fresh repositories inside the holder gate; restore can replace its connection. */
export function withFinance<T>(work: (deps: FinanceContext) => T): T {
  return withDatabase((repos) => {
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
  });
}
export function formOptions({ repos, clock }: FinanceContext): FormOptions {
  return {
    categories: repos.categories.list(),
    paymentMethods: repos.paymentMethods.list(),
    bottles: repos.bottles.list(),
    today: clock.today(),
    baseCurrency: repos.settings.get().baseCurrency,
  };
}
