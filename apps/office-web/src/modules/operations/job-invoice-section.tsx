'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getOfficeInvoiceForJob,
  type InvoiceLineItemSummary,
  type InvoiceSummary
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type JobInvoiceSectionProps = {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
};

const lineKindLabels: Record<InvoiceLineItemSummary['kind'], string> = {
  labor: 'Labor',
  serviceItem: 'Service item',
  part: 'Part',
  equipment: 'Equipment',
  membership: 'Membership',
  other: 'Other'
};

const sourceLabels: Record<InvoiceLineItemSummary['sourceKind'], string> = {
  manual: 'Office',
  register: 'Register',
  estimate: 'Estimate'
};

// The job's single main invoice draft. Read-only in this slice: it shows the
// running bill (currently whatever has been reflected/converted in) plus the
// snapshot totals. Office line editing and estimate conversion arrive in later
// commits. All styling reuses officeWorkspaceStyles so it reads as native.
export function JobInvoiceSection({ jobId, apiBaseUrl, sessionToken }: JobInvoiceSectionProps) {
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadInvoice = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getOfficeInvoiceForJob({ jobId, apiBaseUrl, sessionToken });
      setInvoice(response.invoice);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the invoice draft.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, jobId, sessionToken]);

  useEffect(() => {
    void loadInvoice();
  }, [loadInvoice]);

  return (
    <section style={styles.panel} aria-label="Job invoice draft">
      <div style={styles.row}>
        <h2 style={styles.heading}>Invoice draft</h2>
        {invoice ? (
          <span style={styles.badge}>{invoice.status === 'posted' ? 'Posted' : 'Draft'}</span>
        ) : null}
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

      {isLoading ? (
        <p style={styles.muted}>Loading invoice draft…</p>
      ) : !invoice ? (
        <p style={styles.muted}>No invoice draft for this job yet.</p>
      ) : invoice.lineItems.length === 0 ? (
        <>
          <p style={styles.muted}>
            This draft is empty. Register work and converted estimates will appear here.
          </p>
          <InvoiceTotals invoice={invoice} />
        </>
      ) : (
        <>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeadCell}>Item</th>
                  <th style={styles.tableHeadCell}>Kind</th>
                  <th style={styles.tableHeadCell}>Source</th>
                  <th style={styles.tableHeadCell}>Qty</th>
                  <th style={styles.tableHeadCell}>Unit price</th>
                  <th style={styles.tableHeadCell}>Line total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((line) => (
                  <tr key={line.id}>
                    <td style={styles.tableCell}>
                      {line.description}
                      {line.taxable ? '' : ' (non-taxable)'}
                    </td>
                    <td style={styles.tableCell}>{lineKindLabels[line.kind]}</td>
                    <td style={styles.tableCell}>{sourceLabels[line.sourceKind]}</td>
                    <td style={styles.tableCell}>
                      {line.quantity}
                      {line.unitOfMeasure ? ` ${line.unitOfMeasure}` : ''}
                    </td>
                    <td style={styles.tableCell}>{formatCurrency(line.unitPrice)}</td>
                    <td style={styles.tableCell}>{formatCurrency(line.lineSubtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InvoiceTotals invoice={invoice} />
        </>
      )}
    </section>
  );
}

function InvoiceTotals({ invoice }: { invoice: InvoiceSummary }) {
  const { totals } = invoice;
  return (
    <div style={styles.subpanel}>
      <SummaryRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
      {totals.discount > 0 ? (
        <SummaryRow label="Discount" value={`−${formatCurrency(totals.discount)}`} />
      ) : null}
      <SummaryRow label="Tax" value={formatCurrency(totals.tax)} />
      <SummaryRow label="Total" value={formatCurrency(totals.total)} emphasize />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasize
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div style={styles.row}>
      <span style={styles.tinyMuted}>{label}</span>
      <span style={{ fontWeight: emphasize ? 800 : 600 }}>{value}</span>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(amount);
}
