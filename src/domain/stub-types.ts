// TEMPORARY local stub matching D-012/D-013. Replace with `import ... from "./types"`
// (claude2, issue #3) once it merges, then delete this file.
export type IsoDate = string; // YYYY-MM-DD
export type IsoMonth = string; // YYYY-MM
export type CurrencyCode = "USD" | "VND";
export type Granularity = "week" | "month" | "year";

/** Half-open [start, end). Ids: week = start date, month = YYYY-MM, year = YYYY. */
export interface Period {
  granularity: Granularity;
  id: string;
  start: IsoDate;
  end: IsoDate;
}

export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}
