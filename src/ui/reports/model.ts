import type { Granularity, IsoMonth } from "@/domain/types";

export const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

export function parseGranularity(value: string | string[] | undefined): Granularity {
  return value === "week" || value === "year" || value === "month" ? value : "month";
}

/** A well-formed YYYY-MM not after `current`; anything else falls back to `current`. */
export function parseMonth(value: string | string[] | undefined, current: IsoMonth): IsoMonth {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return current;
  return value > current ? current : value;
}

/** Month arithmetic on YYYY-MM ids (presentational navigation only). */
export function shiftMonth(month: IsoMonth, delta: number): IsoMonth {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function reportHref(granularity: Granularity, month: IsoMonth): string {
  return `/reports?g=${granularity}&month=${month}`;
}
