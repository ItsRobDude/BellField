import type { EstimateRecord } from './estimates.types';

export type EstimateDocument = {
  filename: string;
  html: string;
};

export function renderEstimateDocument(estimate: EstimateRecord): EstimateDocument {
  const filename = `estimate-${safeFilenamePart(estimate.title)}-${estimate.id}.html`;
  return {
    filename,
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(estimate.title)}</title>
  <style>
    body { color: #1f2933; font-family: Arial, sans-serif; margin: 40px; }
    header { border-bottom: 2px solid #176b5b; display: flex; justify-content: space-between; padding-bottom: 18px; }
    h1 { font-size: 28px; margin: 0 0 6px; }
    h2 { font-size: 16px; margin: 24px 0 8px; text-transform: uppercase; }
    h3 { font-size: 15px; margin: 18px 0 8px; }
    table { border-collapse: collapse; margin-top: 12px; width: 100%; }
    th, td { border-bottom: 1px solid #dfe6df; padding: 9px 6px; text-align: left; }
    th, .money { text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    .muted { color: #52606d; }
    .selected { background: #edf8f4; border: 1px solid #80b6a9; border-radius: 8px; padding: 10px; }
    .option { border: 1px solid #dfe6df; border-radius: 8px; margin: 12px 0; padding: 10px; }
    .summary { margin-left: auto; margin-top: 18px; width: 320px; }
    .summary div { display: flex; justify-content: space-between; padding: 5px 0; }
    .total { border-top: 2px solid #176b5b; font-size: 18px; font-weight: 700; margin-top: 8px; padding-top: 10px !important; }
    @media print { body { margin: 24px; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(estimate.title)}</h1>
      <div class="muted">Estimate · ${escapeHtml(statusLabel(estimate.status))}</div>
      ${estimate.description ? `<p>${escapeHtml(estimate.description)}</p>` : ''}
    </div>
    <div class="muted">${estimate.validUntil ? `Valid until ${escapeHtml(estimate.validUntil)}` : ''}</div>
  </header>

  <section>
    <h2>Base Work</h2>
    ${renderLineTable(estimate.lineItems.filter((line) => !line.optionId))}
  </section>

  ${renderOptionSections(estimate)}

  <section class="summary">
    <div><span>Subtotal</span><span>${money(estimate.totals.subtotal)}</span></div>
    <div><span>Discount</span><span>${money(estimate.totals.discount)}</span></div>
    <div><span>Taxable base</span><span>${money(estimate.totals.taxableBase)}</span></div>
    <div><span>Tax</span><span>${money(estimate.totals.tax)}</span></div>
    <div class="total"><span>Total</span><span>${money(estimate.totals.total)}</span></div>
  </section>
</body>
</html>`
  };
}

function renderOptionSections(estimate: EstimateRecord): string {
  if (!estimate.optionGroups?.length) {
    return '';
  }
  return estimate.optionGroups
    .map(
      (group) => `<section>
    <h2>${escapeHtml(group.title)}</h2>
    ${group.options
      .map((option) => {
        const lines = estimate.lineItems.filter((line) => line.optionId === option.id);
        const selected = estimate.selectedOptionId === option.id;
        return `<div class="${selected ? 'selected' : 'option'}">
      <h3>${escapeHtml(option.label)}${selected ? ' - Selected' : ''}</h3>
      ${renderLineTable(lines)}
      <div class="summary">
        <div><span>Option total</span><strong>${money(option.totals.total)}</strong></div>
        <div><span>Profit</span><span>${money(option.totals.profit)}</span></div>
      </div>
    </div>`;
      })
      .join('')}
  </section>`
    )
    .join('');
}

function renderLineTable(lines: EstimateRecord['lineItems']): string {
  if (lines.length === 0) {
    return '<p class="muted">No lines in this section.</p>';
  }
  return `<table>
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
      ${lines.map(renderLine).join('')}
    </tbody>
  </table>`;
}

function renderLine(line: EstimateRecord['lineItems'][number]): string {
  return `<tr>
    <td>${escapeHtml(line.description)}${line.taxable ? '' : '<div class="muted">Non-taxable</div>'}</td>
    <td class="money">${line.quantity}</td>
    <td>${escapeHtml(line.unitOfMeasure ?? '')}</td>
    <td class="money">${money(line.unitPrice)}</td>
    <td class="money">${money(line.lineSubtotal)}</td>
  </tr>`;
}

function statusLabel(status: EstimateRecord['status']): string {
  if (status === 'approved') return 'Approved';
  if (status === 'declined') return 'Declined';
  return 'Pending';
}

function money(value: number): string {
  return value.toLocaleString('en-US', { currency: 'USD', style: 'currency' });
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'estimate';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
