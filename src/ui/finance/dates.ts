import { parseDate } from "@/domain/period";
/** UTC here is a formatting tool, preventing calendar dates from shifting in the browser's zone. */
export function friendlyDate(date: string, today?: string): string {
  const { year, month, day } = parseDate(date);
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(today?.slice(0, 4) === date.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(value);
}
