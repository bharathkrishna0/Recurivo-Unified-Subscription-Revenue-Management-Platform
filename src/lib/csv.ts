export type CsvCell = string | number | null | undefined;

const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (= + - @ tab CR) is prefixed with an
 * apostrophe (CSV injection, REP-03); plain numbers are left alone so they stay numeric.
 */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (!NUMERIC.test(s) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
