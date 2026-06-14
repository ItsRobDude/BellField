import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import type { CompanySettings } from '@bellfield/contracts';
import type { InvoiceRecord } from '../invoices/invoices.types';
import { placeRow, type PdfTableColumn } from './estimate-pdf-layout';

const PAGE_LEFT = 48;
const TABLE_RIGHT = 540;
const ROW_GAP = 6;

export type InvoicePdfRenderInput = {
  invoice: InvoiceRecord;
  settings: CompanySettings;
  generatedAt: string;
};

@Injectable()
export class InvoicePdfRendererService {
  async renderInvoicePdf(input: InvoicePdfRenderInput): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        autoFirstPage: true,
        margin: 48,
        size: 'LETTER',
        info: {
          Title: `${invoiceKindLabel(input.invoice.invoiceKind)} ${input.invoice.id}`,
          Author: input.settings.companyName,
          Subject: `${invoiceKindLabel(input.invoice.invoiceKind)} ${input.invoice.id}`
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

function renderPdf(doc: PDFKit.PDFDocument, input: InvoicePdfRenderInput): void {
  const { invoice, settings } = input;
  const context = invoice.posted;
  if (!context) {
    throw new Error('Invoice PDF email rendering requires posted invoice context.');
  }

  const invoiceLabel = invoiceKindLabel(invoice.invoiceKind);
  doc.fontSize(20).fillColor('#1f2933').text(settings.companyName, { continued: false });
  doc.moveDown(0.4);
  if (settings.replyToEmail) {
    doc.fontSize(10).fillColor('#52606d');
    doc.text(`Reply to: ${settings.replyToEmail}`);
  }
  doc.moveDown(1.2);

  doc.fontSize(18).fillColor('#111827').text(`${invoiceLabel} ${invoice.id}`);
  doc.fontSize(10).fillColor('#52606d').text('Status: Posted');
  doc.text(`Job: ${context.jobNumber}`);
  if (context.workOrderNumber) {
    doc.text(`Work order: ${context.workOrderNumber}`);
  }
  doc.text(`Posted: ${new Date(context.postedAt).toLocaleDateString('en-US')}`);
  doc.text(`Generated: ${new Date(input.generatedAt).toLocaleString('en-US')}`);
  doc.moveDown();

  doc.fontSize(12).fillColor('#111827').text('Bill To', { underline: true });
  renderAddress(doc, context.billTo);
  doc.moveDown(0.8);

  doc.fontSize(12).fillColor('#111827').text('Service Location', { underline: true });
  renderAddress(doc, context.serviceLocation);
  doc.moveDown();

  renderLineTable(doc, invoice);
  doc.moveDown();
  renderTotals(doc, invoice);
}

function renderAddress(
  doc: PDFKit.PDFDocument,
  address: {
    name: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  }
): void {
  doc.fontSize(10).fillColor('#1f2933').text(address.name);
  if (address.addressLine1) {
    doc.text(address.addressLine1);
  }
  const cityState = [address.city, address.state, address.postalCode].filter(Boolean).join(', ');
  if (cityState) {
    doc.text(cityState);
  }
}

function pageBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom;
}

function ensureRoomFor(doc: PDFKit.PDFDocument, fontSize: number): void {
  if (doc.y + fontSize * 1.4 > pageBottom(doc)) {
    doc.addPage();
  }
}

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
  drawTableRow(doc, ['Description', 'Qty', 'Unit', 'Unit price', 'Total'], invoiceLineColumns, {
    fontSize: 9,
    color: '#52606d'
  });
  doc
    .moveTo(PAGE_LEFT, doc.y - ROW_GAP / 2)
    .lineTo(TABLE_RIGHT, doc.y - ROW_GAP / 2)
    .strokeColor('#dfe6df')
    .stroke();
}

function renderLineTable(doc: PDFKit.PDFDocument, invoice: InvoiceRecord): void {
  ensureRoomFor(doc, 9 * 3);
  renderLineTableHeader(doc);

  for (const line of invoice.lineItems) {
    drawTableRow(
      doc,
      [
        `${line.description}${line.taxable ? '' : '\nNon-taxable'}`,
        String(line.quantity),
        line.unitOfMeasure ?? '',
        money(line.unitPrice),
        money(line.lineSubtotal)
      ],
      invoiceLineColumns,
      { fontSize: 10, color: '#1f2933', onNewPage: () => renderLineTableHeader(doc) }
    );
  }
}

const invoiceLineColumns: readonly PdfTableColumn[] = [
  { x: PAGE_LEFT, width: 205 },
  { x: 253, width: 45, align: 'right' },
  { x: 305, width: 65 },
  { x: 375, width: 75, align: 'right' },
  { x: 455, width: 85, align: 'right' }
];

const totalsColumns: readonly PdfTableColumn[] = [
  { x: 340, width: 95 },
  { x: 435, width: 105, align: 'right' }
];

function renderTotals(doc: PDFKit.PDFDocument, invoice: InvoiceRecord): void {
  const totals = [
    ['Subtotal', invoice.totals.subtotal],
    ['Discount', invoice.totals.discount],
    ['Taxable base', invoice.totals.taxableBase],
    ['Tax', invoice.totals.tax],
    ['Total', invoice.totals.total]
  ] as const;
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

function invoiceKindLabel(kind: InvoiceRecord['invoiceKind']): string {
  if (kind === 'adjustment') return 'Adjustment';
  if (kind === 'credit') return 'Credit';
  return 'Invoice';
}

function money(value: number): string {
  return value.toLocaleString('en-US', { currency: 'USD', style: 'currency' });
}
