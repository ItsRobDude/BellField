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
import { estimateLineColumns, placeRow, type PdfTableColumn } from './estimate-pdf-layout';

const PAGE_LEFT = 48;
const TABLE_RIGHT = 540;
const ROW_GAP = 6;

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
    ensureRoomFor(doc, 13);
    doc.fontSize(13).fillColor('#111827').text(group.title, PAGE_LEFT, doc.y);
    for (const option of group.options) {
      const selected = estimate.selectedOptionId === option.id;
      doc.moveDown(0.3);
      ensureRoomFor(doc, 11);
      doc
        .fontSize(11)
        .fillColor(selected ? '#176b5b' : '#1f2933')
        .text(`${option.label}${selected ? ' - Selected' : ''}`, PAGE_LEFT, doc.y);
      renderLineSection(
        doc,
        '',
        estimate.lineItems.filter((line) => line.optionId === option.id)
      );
      ensureRoomFor(doc, 10);
      doc
        .fontSize(10)
        .fillColor('#1f2933')
        .text(`Option total: ${money(option.totals.total)}`, PAGE_LEFT, doc.y, {
          width: TABLE_RIGHT - PAGE_LEFT,
          align: 'right'
        });
    }
  }

  doc.moveDown();
  renderTotals(doc, estimate);
}

function pageBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom;
}

/** Break before single-line headings/labels that would land in the margin. */
function ensureRoomFor(doc: PDFKit.PDFDocument, fontSize: number): void {
  if (doc.y + fontSize * 1.4 > pageBottom(doc)) {
    doc.addPage();
  }
}

/**
 * Draw one table row: every cell at the same y, cursor advanced past the
 * tallest cell, with a page break (and re-drawn header) when the row would
 * cross the bottom margin. doc.x is reset afterward because pdfkit keeps the
 * x of the last positioned text call, which would shove later unpositioned
 * text into the rightmost column.
 */
function drawTableRow(
  doc: PDFKit.PDFDocument,
  cells: string[],
  columns: readonly PdfTableColumn[],
  options: { fontSize: number; color: string; onNewPage?: () => void }
): void {
  doc.fontSize(options.fontSize);
  const cellHeights = cells.map((text, index) =>
    doc.heightOfString(text || ' ', {
      width: columns[index].width,
      align: columns[index].align
    })
  );
  const placement = placeRow({
    y: doc.y,
    cellHeights,
    rowGap: ROW_GAP,
    pageTop: doc.page.margins.top,
    pageBottom: pageBottom(doc)
  });
  if (placement.startsOnNewPage) {
    doc.addPage();
    options.onNewPage?.();
    doc.fontSize(options.fontSize);
  }
  const y = placement.startsOnNewPage ? doc.y : placement.y;
  doc.fillColor(options.color);
  for (const [index, text] of cells.entries()) {
    doc.text(text, columns[index].x, y, {
      width: columns[index].width,
      align: columns[index].align
    });
  }
  doc.x = PAGE_LEFT;
  doc.y = y + Math.max(0, ...cellHeights) + ROW_GAP;
}

function renderLineTableHeader(doc: PDFKit.PDFDocument): void {
  drawTableRow(doc, ['Description', 'Qty', 'Unit', 'Total'], estimateLineColumns, {
    fontSize: 9,
    color: '#52606d'
  });
  doc
    .moveTo(PAGE_LEFT, doc.y - ROW_GAP / 2)
    .lineTo(TABLE_RIGHT, doc.y - ROW_GAP / 2)
    .strokeColor('#dfe6df')
    .stroke();
}

function renderLineSection(
  doc: PDFKit.PDFDocument,
  title: string,
  lines: EstimateRecord['lineItems']
): void {
  if (title) {
    ensureRoomFor(doc, 13);
    doc.fontSize(13).fillColor('#111827').text(title, PAGE_LEFT, doc.y);
  }
  if (lines.length === 0) {
    doc.fontSize(10).fillColor('#52606d').text('No lines in this section.', PAGE_LEFT, doc.y);
    return;
  }

  ensureRoomFor(doc, 9 * 3);
  renderLineTableHeader(doc);

  for (const line of lines) {
    drawTableRow(
      doc,
      [line.description, String(line.quantity), money(line.unitPrice), money(line.lineSubtotal)],
      estimateLineColumns,
      { fontSize: 10, color: '#1f2933', onNewPage: () => renderLineTableHeader(doc) }
    );
  }
}

const totalsColumns: readonly PdfTableColumn[] = [
  { x: 340, width: 95 },
  { x: 435, width: 105, align: 'right' }
];

function renderTotals(doc: PDFKit.PDFDocument, estimate: EstimateRecord): void {
  const totals = [
    ['Subtotal', estimate.totals.subtotal],
    ['Discount', estimate.totals.discount],
    ['Taxable base', estimate.totals.taxableBase],
    ['Tax', estimate.totals.tax],
    ['Total', estimate.totals.total]
  ] as const;
  // Keep the totals block on one page; it is short and reads badly split.
  if (doc.y + totals.length * 18 > pageBottom(doc)) {
    doc.addPage();
  }
  doc.moveTo(340, doc.y).lineTo(TABLE_RIGHT, doc.y).strokeColor('#176b5b').stroke();
  doc.moveDown(0.4);
  for (const [label, value] of totals) {
    drawTableRow(doc, [label, money(value)], totalsColumns, {
      fontSize: label === 'Total' ? 12 : 10,
      color: '#111827'
    });
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
