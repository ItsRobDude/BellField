import { escapeHtml, renderAcceptancePage } from './acceptance-page.html';

const hostileShop = `Acme <script>alert('x')</script> & Sons`;

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<script>"a" & 'b'</script>`)).toBe(
      '&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;'
    );
  });
});

describe('renderAcceptancePage', () => {
  it('renders the open page with options, reasons, and escaped shop strings', () => {
    const page = renderAcceptancePage({
      kind: 'open',
      shopName: hostileShop,
      title: 'AC <replacement> options',
      options: [
        { id: 'opt-good', label: 'Good — repair', totalCents: 84_500 },
        { id: 'opt-best', label: 'Best — <replace>', totalCents: 412_000 }
      ]
    });

    expect(page.httpStatus).toBe(200);
    expect(page.html).not.toContain('<script>alert');
    expect(page.html).toContain('Acme &lt;script&gt;');
    expect(page.html).toContain('AC &lt;replacement&gt; options');
    expect(page.html).toContain('Best — &lt;replace&gt;');
    expect(page.html).toContain('$845.00');
    expect(page.html).toContain('$4,120.00');
    expect(page.html).toContain('Approve estimate');
    expect(page.html).toContain('Going with another company');
    expect(page.html).toContain('value="otherCompany"');
    expect(page.html).toContain('maxlength="500"');
  });

  it('renders a single option without radios', () => {
    const page = renderAcceptancePage({
      kind: 'open',
      shopName: 'Acme HVAC',
      title: 'Water heater swap',
      options: [{ id: 'only', label: 'Replace water heater', totalCents: 240_000 }]
    });

    expect(page.html).not.toContain('type="radio"');
    expect(page.html).toContain('Replace water heater');
    expect(page.html).toContain('$2,400.00');
  });

  it('renders the decided page with the recorded outcome', () => {
    const page = renderAcceptancePage({
      kind: 'decided',
      shopName: 'Acme HVAC',
      title: 'AC replacement options',
      decision: 'approved',
      selectedOptionLabel: 'Best — replace',
      decidedAt: new Date('2026-06-14T15:00:00Z')
    });

    expect(page.httpStatus).toBe(200);
    expect(page.html).toContain('Acme HVAC has been notified');
    expect(page.html).toContain('You approved: Best — replace.');
    expect(page.html).not.toContain('Approve estimate');
  });

  it('renders expired, superseded, and not-found states', () => {
    const expired = renderAcceptancePage({ kind: 'expired', shopName: hostileShop });
    expect(expired.httpStatus).toBe(200);
    expect(expired.html).toContain('This link has expired');
    expect(expired.html).not.toContain('<script>alert');

    const superseded = renderAcceptancePage({ kind: 'superseded', shopName: 'Acme HVAC' });
    expect(superseded.httpStatus).toBe(200);
    expect(superseded.html).toContain('use the link in the newest email');

    const notFound = renderAcceptancePage({ kind: 'notFound' });
    expect(notFound.httpStatus).toBe(404);
    expect(notFound.html).toContain('isn&#39;t available');
  });
});
