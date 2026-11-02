import type { CurrencyCode } from "@/domain/types";
import { money } from "@/ui/format";

export interface AllowanceView {
  leftMinor: number;
  daysLeft: number | null;
  perDayMinor: number | null;
}

/** Presentation for the domain's remainingAllowance result; contains no date or threshold math. */
export function AllowanceLine({
  allowance,
  currency,
  compact = false,
}: {
  allowance: AllowanceView | null;
  currency: CurrencyCode;
  compact?: boolean;
}) {
  if (!allowance) return null;
  const over = allowance.leftMinor < 0;
  return (
    <p className={`allowance-line${compact ? " allowance-line-compact" : ""}`}>
      {over ? (
        <>
          <strong className="money">{money(Math.abs(allowance.leftMinor), currency)}</strong> over
        </>
      ) : (
        <>
          <strong className="money">{money(allowance.leftMinor, currency)}</strong> left
          {allowance.daysLeft !== null && allowance.perDayMinor !== null && (
            <>
              {" "}
              · about <span className="money">{money(allowance.perDayMinor, currency)}</span>/day for{" "}
              {allowance.daysLeft} {allowance.daysLeft === 1 ? "day" : "days"}
            </>
          )}
        </>
      )}
    </p>
  );
}
