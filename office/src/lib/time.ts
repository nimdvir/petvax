import { TIMEZONE } from "@/lib/env";

/** Offset in minutes of America/New_York from UTC at the given instant (e.g. -300 or -240). */
function zoneOffsetMinutes(instant: Date, timeZone = TIMEZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Convert a New York wall-clock date ("2026-11-14") and time ("14:30") to a UTC Date. */
export function nyLocalToUtc(date: string, time: string, timeZone = TIMEZONE): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) throw new Error(`Invalid date/time: ${date} ${time}`);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes handle DST boundaries.
  let offset = zoneOffsetMinutes(new Date(guess), timeZone);
  let result = guess - offset * 60000;
  offset = zoneOffsetMinutes(new Date(result), timeZone);
  result = guess - offset * 60000;
  return new Date(result);
}

/** Split a UTC instant into New York local date ("YYYY-MM-DD") and time ("HH:MM"). */
export function utcToNyParts(instant: Date | string, timeZone = TIMEZONE): { date: string; time: string } {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function formatNyDateTime(instant: Date | string | null | undefined): string {
  if (!instant) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(instant));
}

export function formatNyTime(instant: Date | string | null | undefined): string {
  if (!instant) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit" }).format(new Date(instant));
}

/** Format a calendar date ("YYYY-MM-DD") without any timezone shifting. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function todayInNy(): string {
  return utcToNyParts(new Date()).date;
}

export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Human-readable age from a date of birth, relative to `onDate` (both YYYY-MM-DD). */
export function ageFromDob(dob: string | null | undefined, onDate: string = todayInNy()): string | null {
  if (!dob) return null;
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = onDate.split("-").map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  if (td < bd) months -= 1;
  if (months < 0) return null;
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}
