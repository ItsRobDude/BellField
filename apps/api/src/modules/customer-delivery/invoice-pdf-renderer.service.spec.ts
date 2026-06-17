import type { CompanySettings } from '@bellfield/contracts';
import type { InvoiceRecord } from '../invoices/invoices.types';
import { invoicePdfDisplayTitle, InvoicePdfRendererService } from './invoice-pdf-renderer.service';

const settings = {
  companyName: 'Acme HVAC',
  replyToEmail: 'office@example.com'
} as CompanySettings;

function invoiceRecord(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: 'invoice-1',
    jobId: 'job-1',
    invoiceKind: 'main',
    status: 'posted',
    taxRateBasisPoints: 0,
    lineItems: [
      {
        id: 'line-1',
        invoiceId: 'invoice-1',
        position: 1,
        kind: 'labor',
        description: 'Diagnostic labor',
        quantity: 1,
        unitPrice: 125,
        taxable: true,
        lineSubtotal: 125,
        sourceKind: 'manual',
        sourceSyncState: 'linked',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z'
      }
    ],
    totals: {
      subtotal: 125,
      discount: 0,
      taxableBase: 125,
      tax: 0,
      total: 125,
      totalCost: 0,
      profit: 125,
      marginBasisPoints: 10_000,
      costComplete: true
    },
    posted: {
      postedAt: '2026-06-01T12:00:00.000Z',
      postedByName: 'Olivia Owner',
      billTo: { customerId: 'customer-1', name: 'Acme Co' },
      serviceLocation: { locationId: 'location-1', name: 'Acme HQ' },
      jobNumber: '1001'
    },
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
    version: 2,
    ...overrides
  };
}

function countPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;
}

describe('InvoicePdfRendererService', () => {
  it('uses the durable invoice number as the customer-facing title', () => {
    expect(invoicePdfDisplayTitle(invoiceRecord({ invoiceNumber: 'INV-1042' }))).toBe(
      'Invoice INV-1042'
    );
    expect(
      invoicePdfDisplayTitle(
        invoiceRecord({ invoiceKind: 'adjustment', invoiceNumber: 'ADJ-1043' })
      )
    ).toBe('Adjustment ADJ-1043');
    expect(
      invoicePdfDisplayTitle(invoiceRecord({ invoiceKind: 'credit', invoiceNumber: 'CR-1044' }))
    ).toBe('Credit CR-1044');
  });

  it('falls back to job context instead of raw internal ids for legacy posted invoices', () => {
    expect(invoicePdfDisplayTitle(invoiceRecord({ invoiceNumber: undefined }))).toBe(
      'Invoice for job 1001'
    );
  });

  it('renders a numbered invoice as a PDF', async () => {
    const pdf = await new InvoicePdfRendererService().renderInvoicePdf({
      invoice: invoiceRecord({ invoiceNumber: 'INV-1042' }),
      settings,
      generatedAt: '2026-06-10T00:00:00.000Z'
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(countPages(pdf)).toBe(1);
  });
});
