// Client-side CSV export for the fixed reports (M10 slice 3). Local-first: the report JSON is already
// fetched (which required the server-side view gates), so export is a convenience download of what is
// on screen — the reports:export permission gates the button, not the data. No new server endpoint.

export type CsvColumn<Row> = {
  header: string;
  value: (row: Row) => string | number | null;
};

function escapeCell(value: string | number | null): string {
  const text = value === null || value === undefined ? '' : String(value);
  // Quote when the cell contains a comma, quote, or newline; double embedded quotes.
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<Row>(columns: CsvColumn<Row>[], rows: Row[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
  }
  return lines.join('\n');
}

/** Trigger a browser download of `content` as `filename`. No-op outside the browser. */
export function downloadCsv(filename: string, content: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
