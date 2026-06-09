import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import type { CompanySettings } from '@bellfield/contracts';
import type {
  CustomerAccountRecord,
  JobRecord,
  LocationRecord
} from '../company-data/company-data.types';
import type { EstimateRecord } from '../estimates/estimates.types';
import { bellfieldEstimateEmailFromAddress } from './email-provider.service';

export type EstimatePdfRenderInput = {
  estimate: EstimateRecord;
  settings: CompanySettings;
  job: JobRecord;
  location: LocationRecord;
  billToCustomer: CustomerAccountRecord;
  generatedAt: string;
};

@Injectable()
export class EstimatePdfRendererService {
  async renderEstimatePdf(input: EstimatePdfRenderInput): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        autoFirstPage: true,
        margin: 48,
        size: 'LETTER',
        info: {
          Title: input.estimate.title,
          Author: input.settings.companyName,
          Subject: `Estimate ${input.estimate.id}`
        }
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      renderPdf(doc, input);
      doc.end();
    });
  }
}

function renderPdf(doc: PDFKit.PDFDocument, input: EstimatePdfRenderInput): void {
  const { estimate, settings, job, location, billToCustomer } = input;
  doc.fontSize(20).fillColor('#1f2933').text(settings.companyName, { continued: false });
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor('#52606d').text(bellfieldEstimateEmailFromAddress);
  if (settings.replyToEmail) {
    doc.text(`Reply to: ${settings.replyToEmail}`);
  }
  doc.moveDown(1.2);

  doc.fontSize(18).fillColor('#111827').text(estimate.title);
  doc.fontSize(10).fillColor('#52606d').text(`Estimate ${estimate.id}`);
  doc.text(`Status: ${statusLabel(estimate.status)}`);
  doc.text(`Job: ${job.jobNumber}`);
  doc.text(`Generated: ${new Date(input.generatedAt).toLocaleString('en-US')}`);
  if (estimate.validUntil) {
    doc.text(`Valid until: ${estimate.validUntil}`);
  }
  doc.moveDown();

  doc.fontSize(12).fillColor('#111827').text('Bill To', { underline: true });
  doc.fontSize(10).fillColor('#1f2933').text(billToCustomer.name);
  doc.text(billToCustomer.billingAddressLine1);
  doc.text(
    `${billToCustomer.billingCity}, ${billToCustomer.billingState} ${billToCustomer.billingPostalCode}`
  );
  if (billToCustomer.email) {
    doc.text(billToCustomer.email);
  }
  doc.moveDown(0.8);

  doc.fontSize(12).fillColor('#111827').text('Service Location', { underline: true });
  doc.fontSize(10).fillColor('#1f2933').text(location.name);
  doc.text(location.addressLine1);
  doc.text(`${location.city}, ${location.state} ${location.postalCode}`);
  doc.moveDown();

  if (estimate.description) {
    doc.fontSize(11).fillColor('#1f2933').text(estimate.description);
    doc.moveDown();
  }

  renderLineSection(
    doc,
    'Base Work',
    estimate.lineItems.filter((line) => !line.optionId)
  );

  for (const group of estimate.optionGroups ?? []) {
    doc.moveDown(0.5);
    doc.fontSize(13).fillColor('#111827').text(group.title);
    for (const option of group.options) {
      const selected = estimate.selectedOptionId === option.id;
      doc.moveDown(0.3);
      doc
        .fontSize(11)
        .fillColor(selected ? '#176b5b' : '#1f2933')
        .text(`${option.label}${selected ? ' - Selected' : ''}`);
      renderLineSection(
        doc,
        '',
        estimate.lineItems.filter((line) => line.optionId === option.id)
      );
      doc
        .fontSize(10)
        .fillColor('#1f2933')
        .text(`Option total: ${money(option.totals.total)}`, {
          align: 'right'
        });
    }
  }

  doc.moveDown();
  renderTotals(doc, estimate);
}

function renderLineSection(
  doc: PDFKit.PDFDocument,
  title: string,
  lines: EstimateRecord['lineItems']
): void {
  if (title) {
    doc.fontSize(13).fillColor('#111827').text(title);
  }
  if (lines.length === 0) {
    doc.fontSize(10).fillColor('#52606d').text('No lines in this section.');
    return;
  }

  doc.fontSize(9).fillColor('#52606d');
  doc.text('Description', 48, doc.y, { continued: true, width: 260 });
  doc.text('Qty', 310, doc.y, { continued: true, width: 50, align: 'right' });
  doc.text('Unit', 360, doc.y, { continued: true, width: 75, align: 'right' });
  doc.text('Total', 435, doc.y, { width: 100, align: 'right' });
  doc.moveDown(0.2);
  doc.moveTo(48, doc.y).lineTo(540, doc.y).strokeColor('#dfe6df').stroke();
  doc.moveDown(0.25);

  for (const line of lines) {
    const y = doc.y;
    doc.fontSize(10).fillColor('#1f2933');
    doc.text(line.description, 48, y, { width: 260 });
    doc.text(String(line.quantity), 310, y, { width: 50, align: 'right' });
    doc.text(money(line.unitPrice), 360, y, { width: 75, align: 'right' });
    doc.text(money(line.lineSubtotal), 435, y, { width: 100, align: 'right' });
    doc.moveDown(0.7);
  }
}

function renderTotals(doc: PDFKit.PDFDocument, estimate: EstimateRecord): void {
  const totals = [
    ['Subtotal', estimate.totals.subtotal],
    ['Discount', estimate.totals.discount],
    ['Taxable base', estimate.totals.taxableBase],
    ['Tax', estimate.totals.tax],
    ['Total', estimate.totals.total]
  ] as const;
  doc.moveTo(340, doc.y).lineTo(540, doc.y).strokeColor('#176b5b').stroke();
  doc.moveDown(0.4);
  for (const [label, value] of totals) {
    doc.fontSize(label === 'Total' ? 12 : 10).fillColor('#111827');
    doc.text(label, 340, doc.y, { continued: true, width: 95 });
    doc.text(money(value), 435, doc.y, { width: 105, align: 'right' });
  }
}

function statusLabel(status: EstimateRecord['status']): string {
  if (status === 'approved') return 'Approved';
  if (status === 'declined') return 'Declined';
  return 'Pending';
}

function money(value: number): string {
  return value.toLocaleString('en-US', { currency: 'USD', style: 'currency' });
}
