import type { CurrencyCode } from "@/domain/types";
import { money } from "@/ui/format";
import { Penny } from "@/ui/mascots";
import type { ExpenseSaved } from "@/services/transactions";

export type SpendingAlertView =
  | {
      kind: "warning";
      percent: number;
      spentMinor: number;
      limitMinor: number;
      currency: CurrencyCode;
    }
  | {
      kind: "over";
      overMinor: number;
      currency: CurrencyCode;
    };

type Query = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined =>
  typeof value === "string" ? value : undefined;

const safeInteger = (value: string | undefined, minimum = 0): number | null => {
  if (value === undefined || !/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
};

/** Serialize only presentation data produced by a successful expense service result. */
export function spendingAlertParams(saved: ExpenseSaved, currency: CurrencyCode): URLSearchParams {
  const params = new URLSearchParams();
  if (saved.crossing === "warning" && saved.status) {
    params.set("crossing", "warning");
    params.set("percent", String(Math.round(saved.status.ratio * 100)));
    params.set("spent", String(saved.status.spentMinor));
    params.set("limit", String(saved.status.limitMinor));
    params.set("currency", currency);
  } else if (saved.crossing === "over" && saved.allowance && saved.allowance.leftMinor < 0) {
    params.set("crossing", "over");
    params.set("over", String(Math.abs(saved.allowance.leftMinor)));
    params.set("currency", currency);
  }
  return params;
}

/** Query data affects a confirmation message only; reject malformed or unsupported values. */
export function spendingAlertFromQuery(query: Query): SpendingAlertView | null {
  const crossing = one(query.crossing);
  const currency = one(query.currency);
  if (currency !== "USD" && currency !== "VND") return null;
  if (crossing === "warning") {
    const percent = safeInteger(one(query.percent), 0);
    const spentMinor = safeInteger(one(query.spent), 0);
    const limitMinor = safeInteger(one(query.limit), 0);
    return percent === null || spentMinor === null || limitMinor === null
      ? null
      : { kind: "warning", percent, spentMinor, limitMinor, currency };
  }
  if (crossing === "over") {
    const overMinor = safeInteger(one(query.over), 1);
    return overMinor === null ? null : { kind: "over", overMinor, currency };
  }
  return null;
}

/** A save-time crossing notice. The service/domain supplies every derived number. */
export function SpendingAlert({ alert }: { alert: SpendingAlertView }) {
  const over = alert.kind === "over";
  return (
    <section
      className={`spending-alert spending-alert-${alert.kind}`}
      role={over ? "alert" : "status"}
      aria-label={over ? "Living limit exceeded" : "Living limit warning"}
    >
      <Penny mood={over ? "dizzy" : "worried"} size={76} />
      <div>
        <p className="eyebrow">Living limit update</p>
        <p>
          {over ? (
            <>
              You&apos;ve gone over your living limit by{" "}
              <strong className="money">{money(alert.overMinor, alert.currency)}</strong>.
            </>
          ) : (
            <>
              Heads up: you&apos;re at <strong>{alert.percent} %</strong> of your living limit ({" "}
              <span className="money">{money(alert.spentMinor, alert.currency)}</span> of{" "}
              <span className="money">{money(alert.limitMinor, alert.currency)}</span>).
            </>
          )}
        </p>
      </div>
    </section>
  );
}
