'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  downloadActiveServiceAgreementsCsv,
  downloadExpiringServiceAgreementsCsv,
  downloadServiceAgreementBillingDueCsv,
  downloadServiceAgreementVisitPromptsCsv,
  getServiceAgreementReports,
  type ServiceAgreementReports
} from '@/lib/reporting-api';
import { downloadBlob } from '@/lib/download-file';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

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

export function ServiceAgreementReportsView({
  apiBaseUrl,
  sessionToken,
  canExport
}: {
  apiBaseUrl: string;
  sessionToken: string;
  canExport: boolean;
}) {
  const [report, setReport] = useState<ServiceAgreementReports | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    getServiceAgreementReports({ apiBaseUrl, sessionToken })
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

  async function handleExport(kind: 'active' | 'expiring' | 'billing' | 'visits') {
    try {
      const input = { apiBaseUrl, sessionToken };
      const blob =
        kind === 'active'
          ? await downloadActiveServiceAgreementsCsv(input)
          : kind === 'expiring'
            ? await downloadExpiringServiceAgreementsCsv(input)
            : kind === 'billing'
              ? await downloadServiceAgreementBillingDueCsv(input)
              : await downloadServiceAgreementVisitPromptsCsv(input);
      const date = report?.generatedAt.slice(0, 10) ?? 'export';
      const name =
        kind === 'active'
          ? 'service-agreements-active'
          : kind === 'expiring'
            ? 'service-agreements-expiring'
            : kind === 'billing'
              ? 'service-agreements-billing-due'
              : 'service-agreement-visit-prompts';
      downloadBlob(`${name}-${date}.csv`, blob);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to export the report.');
    }
  }

  return (
    <div>
      <div style={styles.row}>
        <h2 style={{ ...styles.heading, fontSize: '1rem' }}>Service Agreements</h2>
        {canExport && report ? (
          <div style={styles.row}>
            <button type="button" style={styles.button} onClick={() => void handleExport('active')}>
              Export active CSV
            </button>
            <button
              type="button"
              style={styles.button}
              onClick={() => void handleExport('expiring')}
            >
              Export expiring CSV
            </button>
            <button
              type="button"
              style={styles.button}
              onClick={() => void handleExport('billing')}
            >
              Export billing CSV
            </button>
            <button type="button" style={styles.button} onClick={() => void handleExport('visits')}>
              Export visits CSV
            </button>
          </div>
        ) : null}
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {isLoading ? <p style={styles.notice}>Loading...</p> : null}

      {report ? (
        <>
          <p style={styles.tinyMuted}>{formatGeneratedAt(report.generatedAt)}</p>
          <div style={totalsStyle}>
            <TotalItem label="Active" value={String(report.totals.activeAgreementCount)} />
            <TotalItem label="Expiring soon" value={String(report.totals.expiringSoonCount)} />
            <TotalItem label="Billing due" value={String(report.totals.nextBillingDueCount)} />
            <TotalItem
              label="Visit prompts"
              value={String(report.totals.visitTemplatePromptCount)}
            />
          </div>

          <AgreementRowsTable
            title="Active agreements"
            emptyText="No active service agreements."
            rows={report.activeAgreements}
          />
          <AgreementRowsTable
            title={`Expiring by ${report.windows.expiringSoonThrough}`}
            emptyText="No agreements expiring soon."
            rows={report.expiringSoon}
          />
          <BillingDueTable
            title={`Next billing due by ${report.windows.nextBillingDueThrough}`}
            rows={report.nextBillingDue}
          />
          <VisitTemplatePromptsTable
            title={`Visit templates to schedule by ${report.windows.visitTemplatePromptThrough}`}
            rows={report.visitTemplatePrompts}
          />
        </>
      ) : null}
    </div>
  );
}

function AgreementRowsTable({
  title,
  emptyText,
  rows
}: {
  title: string;
  emptyText: string;
  rows: ServiceAgreementReports['activeAgreements'];
}) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3 style={{ ...styles.heading, fontSize: '0.95rem' }}>{title}</h3>
      {rows.length === 0 ? (
        <p style={styles.notice}>{emptyText}</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.tableHeadCell}>Agreement</th>
              <th style={styles.tableHeadCell}>Customer</th>
              <th style={styles.tableHeadCell}>Renewal</th>
              <th style={styles.tableHeadCell}>Billing</th>
              <th style={styles.tableHeadCell}>Coverage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.agreementId}>
                <td style={styles.tableCell}>
                  <strong>{row.agreementNumber}</strong>
                  <div style={styles.tinyMuted}>{row.name}</div>
                </td>
                <td style={styles.tableCell}>{row.customerName}</td>
                <td style={styles.tableCell}>{row.renewalDate ?? row.endDate ?? '-'}</td>
                <td style={styles.tableCell}>{formatAgreementBilling(row)}</td>
                <td style={styles.tableCell}>{formatAgreementCoverage(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function BillingDueTable({
  title,
  rows
}: {
  title: string;
  rows: ServiceAgreementReports['nextBillingDue'];
}) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3 style={{ ...styles.heading, fontSize: '0.95rem' }}>{title}</h3>
      {rows.length === 0 ? (
        <p style={styles.notice}>No service agreement billing due soon.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.tableHeadCell}>Agreement</th>
              <th style={styles.tableHeadCell}>Customer</th>
              <th style={styles.tableHeadCell}>Next billing</th>
              <th style={numberHeadStyle}>Days</th>
              <th style={numberHeadStyle}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.agreementId}>
                <td style={styles.tableCell}>{row.agreementNumber}</td>
                <td style={styles.tableCell}>{row.customerName}</td>
                <td style={styles.tableCell}>{row.nextBillingDate ?? '-'}</td>
                <td style={numberCellStyle}>{row.daysUntilBilling}</td>
                <td style={numberCellStyle}>
                  {row.billingAmount === undefined ? '-' : money(row.billingAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function VisitTemplatePromptsTable({
  title,
  rows
}: {
  title: string;
  rows: ServiceAgreementReports['visitTemplatePrompts'];
}) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3 style={{ ...styles.heading, fontSize: '0.95rem' }}>{title}</h3>
      {rows.length === 0 ? (
        <p style={styles.notice}>No visit templates need scheduling prompts.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.tableHeadCell}>Template</th>
              <th style={styles.tableHeadCell}>Agreement</th>
              <th style={styles.tableHeadCell}>Projected due</th>
              <th style={styles.tableHeadCell}>Work</th>
              <th style={styles.tableHeadCell}>Coverage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.templateId}>
                <td style={styles.tableCell}>
                  <strong>{row.title}</strong>
                  <div style={styles.tinyMuted}>{formatCamelLabel(row.frequency)}</div>
                </td>
                <td style={styles.tableCell}>
                  {row.agreementNumber}
                  <div style={styles.tinyMuted}>{row.customerName}</div>
                </td>
                <td style={styles.tableCell}>
                  {row.projectedDueDate ?? 'Needs date'}
                  {row.daysUntilProjectedDue !== undefined ? (
                    <div style={styles.tinyMuted}>{row.daysUntilProjectedDue} day(s)</div>
                  ) : null}
                </td>
                <td style={styles.tableCell}>
                  {row.jobType ?? 'Recurring service'}
                  {row.category ? <div style={styles.tinyMuted}>{row.category}</div> : null}
                </td>
                <td style={styles.tableCell}>{row.coveredLocationNames.join(', ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
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

function formatGeneratedAt(value: string): string {
  return `Generated ${value.slice(0, 10)} ${value.slice(11, 16)} UTC`;
}

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatAgreementBilling(row: ServiceAgreementReports['activeAgreements'][number]): string {
  if (row.billingCadence === 'none') return 'No recurring billing';
  const amount = row.billingAmount === undefined ? '' : `${money(row.billingAmount)} `;
  const next = row.nextBillingDate ? ` · next ${row.nextBillingDate}` : '';
  return `${amount}${formatCamelLabel(row.billingCadence)}${next}`;
}

function formatAgreementCoverage(row: ServiceAgreementReports['activeAgreements'][number]): string {
  const locations = row.coveredLocationNames.join(', ') || 'No locations listed';
  const equipment =
    row.coveredEquipmentCount > 0 ? ` · ${row.coveredEquipmentCount} equipment item(s)` : '';
  return `${locations}${equipment}`;
}

function formatCamelLabel(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase());
}
