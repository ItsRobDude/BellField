import type { RelayAcceptanceOptionInput } from '@bellfield/contracts';
import type { AcceptancePageState } from './acceptance.service';

// Every customer-facing string on this page fronts the shop, not BellField
// (no-internal-leakage rule). The copy set is owner-reviewed.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatCents(totalCents: number): string {
  return moneyFormat.format(totalCents / 100);
}

const declineReasonLabels: { code: string; label: string }[] = [
  { code: 'price', label: 'The price' },
  { code: 'otherCompany', label: 'Going with another company' },
  { code: 'postponing', label: 'Not moving forward right now' },
  { code: 'questions', label: 'I have questions first' }
];

const pageStyles = `
  :root { color-scheme: light; }
  body { margin: 0; padding: 24px 16px; background: #f4f5f7; color: #1d232b;
         font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .card { max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #dde1e6;
          border-radius: 10px; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: #5a6472; margin: 0 0 20px; }
  .estimate-title { font-size: 16px; font-weight: 600; margin: 0 0 16px; }
  .option { display: flex; align-items: baseline; gap: 10px; padding: 12px;
            border: 1px solid #dde1e6; border-radius: 8px; margin-bottom: 8px; }
  .option label { flex: 1; }
  .option .price { font-weight: 600; white-space: nowrap; }
  textarea { width: 100%; box-sizing: border-box; border: 1px solid #c8cdd4;
             border-radius: 8px; padding: 10px; font: inherit; min-height: 72px; }
  .field-label { display: block; font-size: 14px; color: #5a6472; margin: 16px 0 6px; }
  .actions { display: flex; gap: 10px; margin-top: 20px; }
  button { font: inherit; border-radius: 8px; padding: 10px 18px; cursor: pointer; }
  .primary { background: #1f6f43; color: #fff; border: 1px solid #1f6f43; }
  .secondary { background: #fff; color: #1d232b; border: 1px solid #c8cdd4; }
  .danger { background: #8c2f39; color: #fff; border: 1px solid #8c2f39; }
  #decline-panel { display: none; margin-top: 20px; border-top: 1px solid #dde1e6; padding-top: 16px; }
  .reason { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .error { display: none; color: #8c2f39; margin-top: 14px; }
  .status-note { color: #5a6472; }
  .footer-note { color: #8a93a0; font-size: 13px; margin-top: 24px; }
`;

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${pageStyles}</style>
</head>
<body>
<div class="card">
${body}
</div>
</body>
</html>`;
}

function renderOptions(options: RelayAcceptanceOptionInput[]): string {
  if (options.length === 1) {
    const option = options[0];
    return `<div class="option"><label>${escapeHtml(option.label)}</label><span class="price">${formatCents(option.totalCents)}</span></div>`;
  }
  return options
    .map(
      (option, index) => `<div class="option">
  <input type="radio" name="option" id="option-${index}" value="${escapeHtml(option.id)}">
  <label for="option-${index}">${escapeHtml(option.label)}</label>
  <span class="price">${formatCents(option.totalCents)}</span>
</div>`
    )
    .join('\n');
}

const decisionScript = `
<script>
(function () {
  var errorBox = document.getElementById('error');
  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
  }
  function selectedOptionId() {
    var checked = document.querySelector('input[name="option"]:checked');
    return checked ? checked.value : undefined;
  }
  function noteValue() {
    var note = document.getElementById('note').value.trim();
    return note.length > 0 ? note : undefined;
  }
  function submitDecision(payload) {
    fetch(window.location.pathname + '/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (response.ok || response.status === 409) {
        window.location.reload();
        return;
      }
      return response.json().then(function (body) {
        showError(body && body.message ? body.message : 'Something went wrong. Please try again.');
      });
    }).catch(function () {
      showError('Something went wrong. Please try again.');
    });
  }
  document.getElementById('approve').addEventListener('click', function () {
    var multiple = document.querySelector('input[name="option"]') !== null;
    var optionId = selectedOptionId();
    if (multiple && !optionId) {
      showError('Please choose an option to approve.');
      return;
    }
    submitDecision({ decision: 'approve', optionId: optionId, note: noteValue() });
  });
  document.getElementById('decline').addEventListener('click', function () {
    document.getElementById('decline-panel').style.display = 'block';
    document.getElementById('decline').style.display = 'none';
  });
  document.getElementById('confirm-decline').addEventListener('click', function () {
    var reasons = Array.prototype.map.call(
      document.querySelectorAll('input[name="reason"]:checked'),
      function (input) { return input.value; }
    );
    submitDecision({ decision: 'decline', declineReasons: reasons, note: noteValue() });
  });
  document.getElementById('cancel-decline').addEventListener('click', function () {
    document.getElementById('decline-panel').style.display = 'none';
    document.getElementById('decline').style.display = '';
  });
})();
</script>`;

export function renderAcceptancePage(state: AcceptancePageState): {
  html: string;
  httpStatus: number;
} {
  switch (state.kind) {
    case 'notFound':
      return {
        httpStatus: 404,
        html: pageShell(
          'Estimate link',
          `<h1>This page isn&#39;t available</h1>
<p class="status-note">If you&#39;re looking for an estimate, please contact the company that sent it.</p>`
        )
      };
    case 'expired':
      return {
        httpStatus: 200,
        html: pageShell(
          `Estimate from ${state.shopName}`,
          `<h1>${escapeHtml(state.shopName)}</h1>
<p class="status-note">This link has expired. Please ask ${escapeHtml(state.shopName)} to send the estimate again.</p>`
        )
      };
    case 'superseded':
      return {
        httpStatus: 200,
        html: pageShell(
          `Estimate from ${state.shopName}`,
          `<h1>${escapeHtml(state.shopName)}</h1>
<p class="status-note">This estimate was sent again. Please use the link in the newest email from ${escapeHtml(state.shopName)}.</p>`
        )
      };
    case 'decided': {
      const summary =
        state.decision === 'approved'
          ? state.selectedOptionLabel
            ? `You approved: ${escapeHtml(state.selectedOptionLabel)}.`
            : 'You approved this estimate.'
          : 'You declined this estimate.';
      return {
        httpStatus: 200,
        html: pageShell(
          `Estimate from ${state.shopName}`,
          `<h1>${escapeHtml(state.shopName)}</h1>
<p class="estimate-title">${escapeHtml(state.title)}</p>
<p>Thanks &mdash; ${escapeHtml(state.shopName)} has been notified.</p>
<p class="status-note">${summary} Recorded ${state.decidedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.</p>
<p class="footer-note">Need to change your response? Reply to the email this link came from.</p>`
        )
      };
    }
    case 'open': {
      const reasonCheckboxes = declineReasonLabels
        .map(
          (reason, index) => `<div class="reason">
  <input type="checkbox" name="reason" id="reason-${index}" value="${reason.code}">
  <label for="reason-${index}">${escapeHtml(reason.label)}</label>
</div>`
        )
        .join('\n');
      return {
        httpStatus: 200,
        html: pageShell(
          `Estimate from ${state.shopName}`,
          `<h1>${escapeHtml(state.shopName)}</h1>
<p class="subtitle">sent you an estimate to review</p>
<p class="estimate-title">${escapeHtml(state.title)}</p>
${renderOptions(state.options)}
<label class="field-label" for="note">Anything you&#39;d like to add? (optional)</label>
<textarea id="note" maxlength="500"></textarea>
<div class="actions">
  <button type="button" class="primary" id="approve">Approve estimate</button>
  <button type="button" class="secondary" id="decline">Decline</button>
</div>
<div id="decline-panel">
  <p class="field-label">Mind telling us why? (optional — check any that apply)</p>
${reasonCheckboxes}
  <div class="actions">
    <button type="button" class="danger" id="confirm-decline">Confirm decline</button>
    <button type="button" class="secondary" id="cancel-decline">Cancel</button>
  </div>
</div>
<p class="error" id="error" style="display:none"></p>
<p class="footer-note">The full estimate document is attached to the email this link came from. Questions? Reply to that email.</p>
${decisionScript}`
        )
      };
    }
  }
}

export function renderTooManyRequestsPage(): { html: string; httpStatus: number } {
  return {
    httpStatus: 429,
    html: pageShell(
      'Estimate link',
      `<h1>One moment</h1>
<p class="status-note">Too many requests from this connection. Please try again in a minute.</p>`
    )
  };
}
