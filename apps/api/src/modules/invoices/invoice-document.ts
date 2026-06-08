import type { InvoiceRecord } from './invoices.types';

export type InvoiceDocument = {
  filename: string;
  html: string;
};

export function renderInvoiceDocument(invoice: InvoiceRecord): InvoiceDocument {
  const title = `${invoiceKindLabel(invoice.invoiceKind)} ${invoice.id}`;
  const context = invoice.posted;
  const statusLabel = invoice.status === 'posted' ? 'Posted' : 'Draft';
  const jobNumber = context?.jobNumber ?? invoice.jobId;
  const billToName = context?.billTo.name ?? 'Bill-to details are not available on this draft.';
  const serviceLocationName =
    context?.serviceLocation.name ?? 'Service location details are not available on this draft.';
  const filename = `invoice-${safeFilenamePart(jobNumber)}-${invoice.id}.html`;

  return {
    filename,
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { color: #1f2933; font-family: Arial, sans-serif; margin: 40px; }
    header { border-bottom: 2px solid #176b5b; display: flex; justify-content: space-between; padding-bottom: 18px; }
    h1 { font-size: 28px; margin: 0 0 6px; }
    h2 { font-size: 15px; margin: 22px 0 8px; text-transform: uppercase; }
    table { border-collapse: collapse; margin-top: 18px; width: 100%; }
    th, td { border-bottom: 1px solid #dfe6df; padding: 9px 6px; text-align: left; }
    th, .money { text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    .muted { color: #52606d; }
    .grid { display: grid; gap: 24px; grid-template-columns: 1fr 1fr; margin-top: 20px; }
    .summary { margin-left: auto; margin-top: 18px; width: 320px; }
    .summary div { display: flex; justify-content: space-between; padding: 5px 0; }
    .total { border-top: 2px solid #176b5b; font-size: 18px; font-weight: 700; margin-top: 8px; padding-top: 10px !important; }
    @media print { body { margin: 24px; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(title)}</h1>
      <div class="muted">Job ${escapeHtml(jobNumber)} · ${escapeHtml(statusLabel)}</div>
    </div>
    <div class="muted">${context?.postedAt ? `Posted ${escapeHtml(context.postedAt.slice(0, 10))}` : 'Draft'}</div>
  </header>

  <section class="grid">
    <div>
      <h2>Bill To</h2>
      <div>${escapeHtml(billToName)}</div>
      ${formatAddress(context?.billTo)}
    </div>
    <div>
      <h2>Service Location</h2>
      <div>${escapeHtml(serviceLocationName)}</div>
      ${formatAddress(context?.serviceLocation)}
    </div>
  </section>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit</th>
        <th>Unit Price</th>
        <th>Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${invoice.lineItems.map(renderLine).join('')}
    </tbody>
  </table>

  <section class="summary">
    <div><span>Subtotal</span><span>${money(invoice.totals.subtotal)}</span></div>
    <div><span>Discount</span><span>${money(invoice.totals.discount)}</span></div>
    <div><span>Taxable base</span><span>${money(invoice.totals.taxableBase)}</span></div>
    <div><span>Tax</span><span>${money(invoice.totals.tax)}</span></div>
    <div class="total"><span>Total</span><span>${money(invoice.totals.total)}</span></div>
  </section>
</body>
</html>`
  };
}

function renderLine(line: InvoiceRecord['lineItems'][number]): string {
  return `<tr>
    <td>${escapeHtml(line.description)}${line.taxable ? '' : '<div class="muted">Non-taxable</div>'}</td>
    <td class="money">${line.quantity}</td>
    <td>${escapeHtml(line.unitOfMeasure ?? '')}</td>
    <td class="money">${money(line.unitPrice)}</td>
    <td class="money">${money(line.lineSubtotal)}</td>
  </tr>`;
}

function invoiceKindLabel(kind: InvoiceRecord['invoiceKind']): string {
  if (kind === 'adjustment') return 'Adjustment';
  if (kind === 'credit') return 'Credit';
  return 'Invoice';
}

function formatAddress(
  address:
    | {
        addressLine1?: string;
        city?: string;
        state?: string;
        postalCode?: string;
      }
    | undefined
): string {
  if (!address) return '';
  const cityState = [address.city, address.state, address.postalCode].filter(Boolean).join(', ');
  return [address.addressLine1, cityState]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line ?? '')}</div>`)
    .join('');
}

function money(value: number): string {
  return value.toLocaleString('en-US', { currency: 'USD', style: 'currency' });
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'invoice';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
