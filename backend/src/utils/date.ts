export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Formats a date as YYYY-MM-DD in local time (avoids UTC off-by-one). */
export function toDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentWeekday(date: Date = new Date()): string {
  return WEEKDAYS[date.getDay()];
}

/**
 * Formats a PostgreSQL DATE value as YYYY-MM-DD.
 * node-pg parses DATE columns as *local* midnight, so `toISOString()` would
 * shift the value back one day in any UTC offset east of Greenwich.
 */
export function toLocalDateString(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return toDateString(value);
}

export function addDays(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}
