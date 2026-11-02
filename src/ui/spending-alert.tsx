import type { CurrencyCode } from "@/domain/types";
import { money } from "@/ui/format";
import { Penny } from "@/ui/mascots";

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
              Heads up: you&apos;re at <strong>{alert.percent}%</strong> of your living limit ({" "}
              <span className="money">{money(alert.spentMinor, alert.currency)}</span> of{" "}
              <span className="money">{money(alert.limitMinor, alert.currency)}</span>).
            </>
          )}
        </p>
      </div>
    </section>
  );
}
