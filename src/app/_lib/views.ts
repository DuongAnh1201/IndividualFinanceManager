import { bottleBalances } from "@/domain/bottleBalances";
import type {
  Bottle,
  BottleAllocation,
  BottleRatio,
  BottleRuleVersion,
  BottleTransfer,
  ExchangeRate,
  Income,
  LivingLimit,
  Settings,
} from "@/domain/types";
import { getSuggestedLimit } from "@/services/admin";
import type { SuggestedLimit } from "@/domain/livingLimit";
import { withFinance } from "./finance";
import { formOptions } from "./finance";
import type { FormOptions } from "@/ui/finance/types";

export interface BottlesView {
  options: FormOptions;
  activeBottles: Bottle[];
  balances: Record<string, number>;
  missingRateRows: number;
  incomes: { income: Income; allocations: BottleAllocation[]; rule: BottleRuleVersion | undefined }[];
  transfers: BottleTransfer[];
}

/** Everything the Income & Bottles screen shows; all math comes from the domain. */
export function loadBottlesView(): BottlesView {
  return withFinance((deps) => {
    const { repos } = deps;
    const settings = repos.settings.get();
    const allBottles = repos.bottles.list();
    const incomes = repos.incomes.list();
    const allocations = repos.allocations.list();
    const transfers = repos.transfers.list();
    const result = bottleBalances(
      allBottles,
      allocations,
      incomes,
      transfers,
      repos.expenses.list(),
      settings.baseCurrency,
      repos.exchangeRates.list(),
    );
    const rules = new Map(repos.ruleVersions.list().map((r) => [r.id, r]));
    const m = result.missingRate;
    return {
      options: formOptions(deps),
      activeBottles: allBottles.filter((b) => b.archivedAt === null),
      balances: Object.fromEntries(result.balances.map((b) => [b.bottleId, b.balanceMinor])),
      missingRateRows: m.incomeIds.length + m.transferIds.length + m.expenseIds.length,
      incomes: [...incomes]
        .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
        .map((income) => ({
          income,
          allocations: allocations.filter((a) => a.incomeId === income.id),
          rule: rules.get(income.bottleRuleVersionId),
        })),
      transfers: [...transfers].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    };
  });
}

export interface SettingsView {
  options: FormOptions;
  settings: Settings;
  activeBottles: Bottle[];
  ratios: BottleRatio[];
  rates: ExchangeRate[];
  limits: LivingLimit[];
  suggested: SuggestedLimit | null;
  month: string;
}

export function loadSettingsView(): SettingsView {
  return withFinance((deps) => {
    const { repos, clock } = deps;
    const options = formOptions(deps);
    const month = clock.today().slice(0, 7);
    const suggested = getSuggestedLimit(deps, month);
    return {
      options,
      settings: repos.settings.get(),
      activeBottles: options.bottles.filter((b) => b.archivedAt === null),
      ratios: repos.ruleVersions.latest()?.ratios ?? [],
      rates: repos.exchangeRates.list(),
      limits: repos.livingLimits.list(),
      suggested: suggested.ok ? suggested.value : null,
      month,
    };
  });
}
