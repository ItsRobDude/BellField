'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  downloadArOpenBalancesCsv,
  downloadInventoryValuationCsv,
  downloadJobProfitabilityCsv,
  getArOpenBalances,
  getInventoryValuation,
  getJobProfitability,
  type ArOpenBalancesReport,
  type InventoryValuationReport,
  type JobProfitabilityReport
} from '@/lib/reporting-api';
import { downloadBlob } from '@/lib/download-file';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeReportsSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  /** reports:export — gates the CSV export buttons (also enforced server-side). */
  canExportReports: boolean;
  /** jobCosting:view — gates the Job Profitability report. */
  canViewProfitability: boolean;
  /** inventory:view — gates the Inventory Valuation report. */
  canViewInventoryValuation: boolean;
};

type ReportKey = 'ar' | 'profitability' | 'inventory';

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
const tabStripStyle: CSSProperties = { display: 'flex', gap: 6, margin: '8px 0 4px' };
const tabStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid #cbd2da',
  borderRadius: 6,
  padding: '4px 12px',
  cursor: 'pointer',
  fontWeight: 600,
  color: '#33455c'
};
const activeTabStyle: CSSProperties = {
  ...tabStyle,
  background: '#176b5b',
  // Override the full `border` shorthand (not borderColor) — mixing shorthand + longhand for the same
  // property triggers React's "removing a style property during rerender" warning when tabs toggle.
  border: '1px solid #176b5b',
  color: '#ffffff'
};
const incompleteBadgeStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: 2,
  fontSize: 11,
  fontWeight: 600,
  color: '#8a5a00',
  background: '#fdf2dc',
  borderRadius: 8,
  padding: '0 6px'
};

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatMargin(basisPoints: number | null): string {
  return basisPoints === null ? '—' : `${(basisPoints / 100).toFixed(1)}%`;
}

// Top-level Reports surface (M10 slice 3). Fixed, read-only reports — no builder. Tabs appear per the
// actor's gates: AR/Open Balances always; Job Profitability with jobCosting:view (Inventory in 3C).
export function OfficeReportsSurface({
  apiBaseUrl,
  sessionToken,
  canExportReports,
  canViewProfitability,
  canViewInventoryValuation
}: OfficeReportsSurfaceProps) {
  const [active, setActive] = useState<ReportKey>('ar');
  const tabs: Array<{ key: ReportKey; label: string }> = [
    { key: 'ar', label: 'AR / Open Balances' },
    ...(canViewProfitability
      ? [{ key: 'profitability' as ReportKey, label: 'Job Profitability' }]
      : []),
    ...(canViewInventoryValuation
      ? [{ key: 'inventory' as ReportKey, label: 'Inventory Valuation' }]
      : [])
  ];

  return (
    <section style={styles.workspacePanel} aria-label="Reports">
      <h1 style={styles.heading}>Reports</h1>
      <div style={tabStripStyle} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            style={active === tab.key ? activeTabStyle : tabStyle}
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === 'ar' ? (
        <ArOpenBalancesReportView
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          canExport={canExportReports}
        />
      ) : null}
      {active === 'profitability' && canViewProfitability ? (
        <JobProfitabilityReportView
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          canExport={canExportReports}
        />
      ) : null}
      {active === 'inventory' && canViewInventoryValuation ? (
        <InventoryValuationReportView
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          canExport={canExportReports}
        />
      ) : null}
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

  async function handleExport() {
    try {
      const blob = await downloadArOpenBalancesCsv({ apiBaseUrl, sessionToken });
      downloadBlob(`ar-open-balances-${report?.generatedAt.slice(0, 10) ?? 'export'}.csv`, blob);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to export the report.');
    }
  }

  return (
    <div>
      <div style={styles.row}>
        <h2 style={{ ...styles.heading, fontSize: '1rem' }}>AR / Open Balances</h2>
        {canExport && report ? (
          <button type="button" style={styles.button} onClick={() => void handleExport()}>
            Export CSV
          </button>
        ) : null}
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {isLoading ? <p style={styles.notice}>Loading…</p> : null}

      {report ? (
        <>
          <div style={totalsStyle}>
            <TotalItem label="Jobs owing" value={String(report.totals.jobCount)} />
            <TotalItem label="Net billed" value={money(report.totals.netBilled)} />
            <TotalItem label="Paid" value={money(report.totals.paidTotal)} />
            <TotalItem label="Amount due" value={money(report.totals.amountDue)} />
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

function JobProfitabilityReportView({
  apiBaseUrl,
  sessionToken,
  canExport
}: {
  apiBaseUrl: string;
  sessionToken: string;
  canExport: boolean;
}) {
  const [report, setReport] = useState<JobProfitabilityReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    getJobProfitability({ apiBaseUrl, sessionToken })
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

  async function handleExport() {
    try {
      const blob = await downloadJobProfitabilityCsv({ apiBaseUrl, sessionToken });
      downloadBlob(`job-profitability-${report?.generatedAt.slice(0, 10) ?? 'export'}.csv`, blob);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to export the report.');
    }
  }

  return (
    <div>
      <div style={styles.row}>
        <h2 style={{ ...styles.heading, fontSize: '1rem' }}>Job Profitability</h2>
        {canExport && report ? (
          <button type="button" style={styles.button} onClick={() => void handleExport()}>
            Export CSV
          </button>
        ) : null}
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {isLoading ? <p style={styles.notice}>Loading…</p> : null}

      {report ? (
        <>
          <div style={totalsStyle}>
            <TotalItem label="Jobs" value={String(report.totals.jobCount)} />
            <TotalItem label="Revenue" value={money(report.totals.revenue)} />
            <TotalItem label="Known cost" value={money(report.totals.knownCost)} />
            <TotalItem label="Known profit" value={money(report.totals.knownProfit)} />
            <TotalItem label="Cost incomplete" value={String(report.totals.incompleteJobCount)} />
          </div>

          {report.rows.length === 0 ? (
            <p style={styles.notice}>No jobs with posted invoices yet.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeadCell}>Job #</th>
                  <th style={styles.tableHeadCell}>Customer</th>
                  <th style={styles.tableHeadCell}>Status</th>
                  <th style={numberHeadStyle}>Revenue</th>
                  <th style={numberHeadStyle}>Total cost</th>
                  <th style={numberHeadStyle}>Profit</th>
                  <th style={numberHeadStyle}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.jobId}>
                    <td style={styles.tableCell}>
                      {r.jobNumber}
                      {!r.costComplete ? (
                        <span style={incompleteBadgeStyle}>
                          Cost incomplete ({r.unresolvedLineCount})
                        </span>
                      ) : null}
                    </td>
                    <td style={styles.tableCell}>{r.customerName}</td>
                    <td style={styles.tableCell}>{r.status}</td>
                    <td style={numberCellStyle}>{money(r.revenue)}</td>
                    <td style={numberCellStyle}>{money(r.totalCost)}</td>
                    <td style={numberCellStyle}>{money(r.profit)}</td>
                    <td style={numberCellStyle}>{formatMargin(r.marginBasisPoints)}</td>
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

function InventoryValuationReportView({
  apiBaseUrl,
  sessionToken,
  canExport
}: {
  apiBaseUrl: string;
  sessionToken: string;
  canExport: boolean;
}) {
  const [report, setReport] = useState<InventoryValuationReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    getInventoryValuation({ apiBaseUrl, sessionToken })
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

  async function handleExport() {
    try {
      const blob = await downloadInventoryValuationCsv({ apiBaseUrl, sessionToken });
      downloadBlob(`inventory-valuation-${report?.generatedAt.slice(0, 10) ?? 'export'}.csv`, blob);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to export the report.');
    }
  }

  return (
    <div>
      <div style={styles.row}>
        <h2 style={{ ...styles.heading, fontSize: '1rem' }}>Inventory Valuation</h2>
        {canExport && report ? (
          <button type="button" style={styles.button} onClick={() => void handleExport()}>
            Export CSV
          </button>
        ) : null}
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {isLoading ? <p style={styles.notice}>Loading…</p> : null}

      {report ? (
        <>
          <div style={totalsStyle}>
            <TotalItem label="Lines" value={String(report.totals.rowCount)} />
            <TotalItem label="Total quantity" value={String(report.totals.totalQuantity)} />
            <TotalItem label="Total value" value={money(report.totals.totalValue)} />
          </div>

          {report.rows.length === 0 ? (
            <p style={styles.notice}>No inventory on hand.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeadCell}>Item</th>
                  <th style={styles.tableHeadCell}>Kind</th>
                  <th style={styles.tableHeadCell}>Location</th>
                  <th style={numberHeadStyle}>Quantity</th>
                  <th style={numberHeadStyle}>Avg unit cost</th>
                  <th style={numberHeadStyle}>Total value</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={`${r.itemId}:${r.locationId}`}>
                    <td style={styles.tableCell}>{r.itemName}</td>
                    <td style={styles.tableCell}>{r.itemKind}</td>
                    <td style={styles.tableCell}>{r.locationName}</td>
                    <td style={numberCellStyle}>{r.quantity}</td>
                    <td style={numberCellStyle}>{money(r.averageUnitCost)}</td>
                    <td style={numberCellStyle}>{money(r.totalValue)}</td>
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

function TotalItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={totalItemLabel}>{label}</div>
      <div style={totalItemValue}>{value}</div>
    </div>
  );
}
