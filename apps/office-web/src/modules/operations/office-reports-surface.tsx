'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { getArOpenBalances, type ArOpenBalancesReport } from '@/lib/reporting-api';
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/reporting-csv';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeReportsSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  /** reports:export — gates the CSV export button (the data is already view-gated server-side). */
  canExportReports: boolean;
};

const numberCellStyle: CSSProperties = { ...styles.tableCell, textAlign: 'right' };
const numberHeadStyle: CSSProperties = { ...styles.tableHeadCell, textAlign: 'right' };
const totalsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 18,
  margin: '12px 0',
  color: '#33455c'
};
const totalItemLabel: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  color: '#5b6672'
};
const totalItemValue: CSSProperties = { fontSize: 18, fontWeight: 700 };

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

// Top-level Reports surface (M10 slice 3). Fixed, read-only reports — no builder. v1 ships the
// AR/Open Balances report; Job Profitability and Inventory Valuation tabs are added (gated) in 3B/3C.
export function OfficeReportsSurface({
  apiBaseUrl,
  sessionToken,
  canExportReports
}: OfficeReportsSurfaceProps) {
  return (
    <section style={styles.workspacePanel} aria-label="Reports">
      <h1 style={styles.heading}>Reports</h1>
      <ArOpenBalancesReportView
        apiBaseUrl={apiBaseUrl}
        sessionToken={sessionToken}
        canExport={canExportReports}
      />
    </section>
  );
}

function ArOpenBalancesReportView({
  apiBaseUrl,
  sessionToken,
  canExport
}: {
  apiBaseUrl: string;
  sessionToken: string;
  canExport: boolean;
}) {
  const [report, setReport] = useState<ArOpenBalancesReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    getArOpenBalances({ apiBaseUrl, sessionToken })
      .then((result) => {
        if (active) setReport(result);
      })
      .catch((error) => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load report.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, sessionToken]);

  function handleExport() {
    if (!report) return;
    const columns: CsvColumn<ArOpenBalancesReport['rows'][number]>[] = [
      { header: 'Job #', value: (r) => r.jobNumber },
      { header: 'Customer', value: (r) => r.customerName },
      { header: 'Net billed', value: (r) => r.netBilled },
      { header: 'Paid', value: (r) => r.paidTotal },
      { header: 'Amount due', value: (r) => r.amountDue }
    ];
    downloadCsv(
      `ar-open-balances-${report.generatedAt.slice(0, 10)}.csv`,
      toCsv(columns, report.rows)
    );
  }

  return (
    <div>
      <div style={styles.row}>
        <h2 style={{ ...styles.heading, fontSize: '1rem' }}>AR / Open Balances</h2>
        {canExport && report ? (
          <button type="button" style={styles.button} onClick={handleExport}>
            Export CSV
          </button>
        ) : null}
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {isLoading ? <p style={styles.notice}>Loading…</p> : null}

      {report ? (
        <>
          <div style={totalsStyle}>
            <div>
              <div style={totalItemLabel}>Jobs owing</div>
              <div style={totalItemValue}>{report.totals.jobCount}</div>
            </div>
            <div>
              <div style={totalItemLabel}>Net billed</div>
              <div style={totalItemValue}>{money(report.totals.netBilled)}</div>
            </div>
            <div>
              <div style={totalItemLabel}>Paid</div>
              <div style={totalItemValue}>{money(report.totals.paidTotal)}</div>
            </div>
            <div>
              <div style={totalItemLabel}>Amount due</div>
              <div style={totalItemValue}>{money(report.totals.amountDue)}</div>
            </div>
          </div>

          {report.rows.length === 0 ? (
            <p style={styles.notice}>No jobs with an open balance.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeadCell}>Job #</th>
                  <th style={styles.tableHeadCell}>Customer</th>
                  <th style={numberHeadStyle}>Net billed</th>
                  <th style={numberHeadStyle}>Paid</th>
                  <th style={numberHeadStyle}>Amount due</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.jobId}>
                    <td style={styles.tableCell}>{r.jobNumber}</td>
                    <td style={styles.tableCell}>{r.customerName}</td>
                    <td style={numberCellStyle}>{money(r.netBilled)}</td>
                    <td style={numberCellStyle}>{money(r.paidTotal)}</td>
                    <td style={numberCellStyle}>{money(r.amountDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </div>
  );
}
