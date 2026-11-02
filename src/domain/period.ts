import type { Granularity, IsoDate, IsoMonth, Period, WeekStart } from "./types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width: number) => String(n).padStart(width, "0");

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in `month` (1–12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month: ${month}`);
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Clamp `day` to the last day of the month (BR-1: 31 → Feb 28/29). Returns an ISO date. */
export function clampDay(year: number, month: number, day: number): IsoDate {
  if (!Number.isInteger(day) || day < 1) throw new RangeError(`Invalid day: ${day}`);
  return formatDate(year, month, Math.min(day, daysInMonth(year, month)));
}

export function formatDate(year: number, month: number, day: number): IsoDate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function parseDate(date: IsoDate): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid date (expected YYYY-MM-DD): ${date}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Invalid date: ${date}`);
  }
  return { year, month, day };
}

/** `YYYY-MM` of a date. */
export function monthOf(date: IsoDate): IsoMonth {
  const { year, month } = parseDate(date);
  return `${pad(year, 4)}-${pad(month, 2)}`;
}

// Days since 1970-01-01 (Howard Hinnant's days_from_civil); pure integer math, no Date.
function toDayNumber(date: IsoDate): number {
  const { year, month, day } = parseDate(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDayNumber(n: number): IsoDate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return formatDate(year, month, day);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: IsoDate): WeekStart {
  // 1970-01-01 was a Thursday (4).
  return ((((toDayNumber(date) + 4) % 7) + 7) % 7) as WeekStart;
}

/** The period of `granularity` containing `date`. Weeks start on `weekStartsOn` (Monday default). */
export function periodOf(granularity: Granularity, date: IsoDate, weekStartsOn: WeekStart = 1): Period {
  const { year, month } = parseDate(date);
  switch (granularity) {
    case "week": {
      const start = addDays(date, -((dayOfWeek(date) - weekStartsOn + 7) % 7));
      return { granularity, id: start, start, end: addDays(start, 7) };
    }
    case "month": {
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      return {
        granularity,
        id: `${pad(year, 4)}-${pad(month, 2)}`,
        start: formatDate(year, month, 1),
        end: formatDate(nextYear, nextMonth, 1),
      };
    }
    case "year":
      return {
        granularity,
        id: pad(year, 4),
        start: formatDate(year, 1, 1),
        end: formatDate(year + 1, 1, 1),
      };
  }
}

/** True if `date` falls in the half-open `[start, end)`. */
export function periodContains(period: Period, date: IsoDate): boolean {
  parseDate(date);
  return date >= period.start && date < period.end;
}

export function previousPeriod(period: Period, weekStartsOn: WeekStart = 1): Period {
  return periodOf(period.granularity, addDays(period.start, -1), weekStartsOn);
}

export function nextPeriod(period: Period, weekStartsOn: WeekStart = 1): Period {
  return periodOf(period.granularity, period.end, weekStartsOn);
}

/** The last `n` periods ending with the one containing `today`, oldest first (BR-7 uses n = 5). */
export function lastNPeriods(
  granularity: Granularity,
  n: number,
  today: IsoDate,
  weekStartsOn: WeekStart = 1,
): Period[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`n must be a positive integer: ${n}`);
  let current = periodOf(granularity, today, weekStartsOn);
  const result: Period[] = [current];
  while (result.length < n) {
    current = previousPeriod(current, weekStartsOn);
    result.unshift(current);
  }
  return result;
}
