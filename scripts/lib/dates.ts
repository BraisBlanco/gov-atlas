/**
 * Calendar arithmetic on `YYYY-MM-DD` strings, in and out.
 *
 * Dates live as plain strings everywhere else in this project — data files, validation and
 * published JSON alike, per the guard in load.ts. `Date` is used here for the month-length
 * and leap-year rules only, and never escapes this module. `Date.UTC` rather than the
 * local-time constructor, so a result can never shift by a day depending on where the
 * build runs.
 */

function shiftDay(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function dayAfter(iso: string): string {
  return shiftDay(iso, 1);
}

export function dayBefore(iso: string): string {
  return shiftDay(iso, -1);
}

/** `YYYY-MM-DD` strings compare correctly as strings; named for call-site readability. */
export function onOrBefore(a: string, b: string): boolean {
  return a <= b;
}

/**
 * Days since 1970-01-01, for positioning a date on a linear time axis.
 *
 * A time axis has to be linear in *days*, not in points: spacing the change points evenly
 * would make a six-month reshuffle look as long as a four-year term.
 */
export function dayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}
