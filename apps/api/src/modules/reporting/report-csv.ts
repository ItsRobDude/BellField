// Server-side CSV rendering for report exports (M10 slice 3). Export is gated on reports:export (plus
// the report's own view gates) and produced here, not in the browser — so the permission is enforced
// server-side, consistent with BellField's permission model.

export type CsvColumn<Row> = {
  header: string;
  value: (row: Row) => string | number | null;
};

// Leading characters a spreadsheet may treat as a formula (CSV / formula injection).
const FORMULA_LEADERS = /^[=+\-@\t\r]/;

function escapeCell(value: string | number | null): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);
  // Neutralize formula injection: a *text* cell beginning with = + - @ (or tab/CR) is prefixed with a
  // single quote so Excel/Sheets render it literally. Only text — numbers (amounts, quantities) must
  // stay numeric, and a numeric -25 is a value, not a formula.
  if (typeof value === 'string' && FORMULA_LEADERS.test(text)) {
    text = `'${text}`;
  }
  // Quote when the cell contains a comma, quote, or newline; double any embedded quotes.
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<Row>(columns: CsvColumn<Row>[], rows: Row[]): string {
  const lines = [columns.map((column) => escapeCell(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(','));
  }
  return lines.join('\n');
}
