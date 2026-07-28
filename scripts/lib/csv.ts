/**
 * Minimal RFC 4180 writer.
 *
 * Every chart on the site offers "download this data", and the download has to be the
 * same numbers the chart drew — so the CSVs are generated from the derived values in the
 * same build step, not exported by hand later.
 */

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = Array.isArray(value) ? value.join(' | ') : String(value);
  return /["\n\r,]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv<T extends object>(
  rows: readonly T[],
  columns: readonly (keyof T & string)[],
): string {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => cell(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}
