'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addOfficeInvoiceLine,
  downloadOfficeInvoiceDocument,
  editOfficeInvoiceLine,
  getOfficeInvoiceForJob,
  postOfficeInvoice,
  voidOfficeInvoiceLine,
  type EstimateEmailDeliveryStatus,
  type InvoiceLineItemSummary,
  type InvoiceSummary,
  type OutboundMessageSummary
} from '@/lib/operations-api';
import {
  cancelOfficeInvoiceOutboundMessage,
  getOfficeInvoiceOutboundMessages,
  getOfficeInvoiceSendPreview,
  sendOfficeInvoice
} from '@/lib/operations-invoice-delivery-api';
import { downloadBlob } from '@/lib/download-file';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  buildInvoiceLineDraft,
  createEmptyInvoiceLineDraft,
  invoiceLineKindLabels,
  parseInvoiceLineDraft,
  type InvoiceLineDraft
} from './job-invoice-types';
import {
  formatCurrency,
  InvoiceLineEditor,
  InvoiceTotals,
  invoiceSourceLabels,
  PostedInvoiceSummary,
  type InvoicePaymentPermissions
} from './job-invoice-shared';
import { JobInvoiceCorrections } from './job-invoice-corrections';
import { DocumentDeliveryPanel, type DocumentDeliveryDraft } from './job-estimate-delivery-panel';

type JobInvoiceSectionProps = {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
  canEdit: boolean;
  canPost: boolean;
  canSend: boolean;
  billToCustomerEmail?: string;
  canCreateAdjustments: boolean;
  paymentPermissions: InvoicePaymentPermissions;
};

// The job's single main invoice draft: the running bill, fed by reflected
// register work plus manual office lines. Office users with invoices:edit can
// add, edit, and void lines; editing a register-sourced line detaches it from
// its register source on the server. Users with invoices:post can post (lock)
// the draft, which freezes its display context and stops further editing. Once
// posted, the corrections section (adjustments/credits + balance) appears below.
// All styling reuses officeWorkspaceStyles.
const queuedDeliveryPollIntervalMs = 15_000;

export function JobInvoiceSection({
  jobId,
  apiBaseUrl,
  sessionToken,
  canEdit,
  canPost,
  canSend,
  billToCustomerEmail,
  canCreateAdjustments,
  paymentPermissions
}: JobInvoiceSectionProps) {
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [newLineDraft, setNewLineDraft] = useState<InvoiceLineDraft | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<InvoiceLineDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeliveryPanelOpen, setIsDeliveryPanelOpen] = useState(false);
  const [deliveryDraft, setDeliveryDraft] = useState<DocumentDeliveryDraft>({
    recipientEmail: billToCustomerEmail ?? '',
    subject: '',
    bodyText: ''
  });
  const [outboundMessages, setOutboundMessages] = useState<OutboundMessageSummary[]>([]);
  const [deliveryStatus, setDeliveryStatus] = useState<EstimateEmailDeliveryStatus | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);
  const [cancelingMessageId, setCancelingMessageId] = useState<string | null>(null);

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

  useEffect(() => {
    setDeliveryDraft((current) => ({
      ...current,
      recipientEmail: current.recipientEmail || billToCustomerEmail || ''
    }));
  }, [billToCustomerEmail]);

  function applyResult(next: InvoiceSummary, notice: string) {
    setInvoice(next);
    setNoticeMessage(notice);
    setErrorMessage(null);
  }

  async function addLine() {
    if (!newLineDraft) return;
    const parsed = parseInvoiceLineDraft(newLineDraft);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }
    setIsSaving(true);
    try {
      const response = await addOfficeInvoiceLine({
        jobId,
        apiBaseUrl,
        sessionToken,
        ...parsed.value
      });
      applyResult(response.invoice, 'Line added.');
      setNewLineDraft(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add the line.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEdit(lineId: string) {
    if (!editDraft) return;
    const parsed = parseInvoiceLineDraft(editDraft);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }
    setIsSaving(true);
    try {
      const response = await editOfficeInvoiceLine({
        lineId,
        apiBaseUrl,
        sessionToken,
        ...parsed.value
      });
      applyResult(response.invoice, 'Line updated.');
      setEditingLineId(null);
      setEditDraft(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the line.');
    } finally {
      setIsSaving(false);
    }
  }

  async function voidLine(line: InvoiceLineItemSummary) {
    if (!window.confirm(`Remove "${line.description}" from the invoice?`)) return;
    setIsSaving(true);
    try {
      const response = await voidOfficeInvoiceLine({ lineId: line.id, apiBaseUrl, sessionToken });
      applyResult(response.invoice, 'Line removed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to remove the line.');
    } finally {
      setIsSaving(false);
    }
  }

  async function postInvoice() {
    // Posting is a locking, accounting-significant action: confirm even when permitted.
    if (
      !window.confirm(
        'Post this invoice? Once posted it becomes the locked accounting record and can no longer be edited.'
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const response = await postOfficeInvoice({ jobId, apiBaseUrl, sessionToken });
      applyResult(response.invoice, 'Invoice posted.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to post the invoice.');
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadInvoiceDocument() {
    if (!invoice) return;
    setErrorMessage(null);
    try {
      const blob = await downloadOfficeInvoiceDocument({
        invoiceId: invoice.id,
        apiBaseUrl,
        sessionToken
      });
      const jobNumber = invoice.posted?.jobNumber ?? invoice.jobId;
      downloadBlob(`invoice-${safeFilenamePart(jobNumber)}-${invoice.id}.html`, blob);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download the invoice.');
    }
  }

  const loadDeliveryHistory = useCallback(
    async (invoiceId: string, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsHistoryLoading(true);
        setErrorMessage(null);
      }
      try {
        const response = await getOfficeInvoiceOutboundMessages({
          invoiceId,
          apiBaseUrl,
          sessionToken
        });
        setOutboundMessages(response.outboundMessages);
      } catch (error) {
        if (!options?.silent) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to load invoice delivery history.'
          );
        }
      } finally {
        if (!options?.silent) {
          setIsHistoryLoading(false);
        }
      }
    },
    [apiBaseUrl, sessionToken]
  );

  const hasQueuedDelivery = outboundMessages.some((message) => message.status === 'queued');

  useEffect(() => {
    if (!invoice || !isDeliveryPanelOpen || !hasQueuedDelivery) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void loadDeliveryHistory(invoice.id, { silent: true });
    }, queuedDeliveryPollIntervalMs);
    return () => window.clearInterval(intervalId);
  }, [hasQueuedDelivery, invoice, isDeliveryPanelOpen, loadDeliveryHistory]);

  async function loadSendPreview(invoiceId: string) {
    setIsPreviewLoading(true);
    setErrorMessage(null);
    try {
      const response = await getOfficeInvoiceSendPreview({
        invoiceId,
        apiBaseUrl,
        sessionToken
      });
      setDeliveryStatus(response.deliveryStatus);
      setDeliveryDraft((current) => ({
        ...current,
        recipientEmail: current.recipientEmail || billToCustomerEmail || '',
        subject: current.subject || response.preview.subject,
        bodyText: current.bodyText || response.preview.bodyText
      }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load invoice send preview.'
      );
    } finally {
      setIsPreviewLoading(false);
    }
  }

  function toggleDeliveryPanel() {
    if (!invoice) return;
    setNoticeMessage(null);
    setErrorMessage(null);
    const next = !isDeliveryPanelOpen;
    setIsDeliveryPanelOpen(next);
    if (next) {
      setDeliveryDraft((current) => ({
        recipientEmail: current.recipientEmail || billToCustomerEmail || '',
        subject: current.subject,
        bodyText: current.bodyText
      }));
      void loadDeliveryHistory(invoice.id);
      void loadSendPreview(invoice.id);
    }
  }

  async function sendInvoiceEmail() {
    if (!invoice) return;
    const recipientEmail = deliveryDraft.recipientEmail.trim();
    if (!recipientEmail) {
      setErrorMessage('Recipient email is required.');
      return;
    }
    if (!window.confirm(`Send this invoice PDF to ${recipientEmail}?`)) {
      return;
    }

    setIsSendingInvoice(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    setWarningMessage(null);
    try {
      const response = await sendOfficeInvoice({
        invoiceId: invoice.id,
        apiBaseUrl,
        sessionToken,
        recipientEmail,
        subject: deliveryDraft.subject.trim() || undefined,
        bodyText: deliveryDraft.bodyText.trim() || undefined
      });
      await loadDeliveryHistory(invoice.id);
      if (response.outboundMessage.status === 'sent') {
        if (response.recordingIncomplete) {
          setWarningMessage(
            'The email was sent, but BellField could not finish recording it. Do not resend until support checks it.'
          );
        } else {
          setNoticeMessage(
            response.paymentLinkIncluded ? 'Invoice sent with a pay-now link.' : 'Invoice sent.'
          );
        }
      } else if (response.outboundMessage.status === 'queued') {
        setNoticeMessage('Queued — will send automatically.');
      } else {
        setErrorMessage(response.outboundMessage.deliveryMessage ?? 'Invoice delivery failed.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send the invoice.');
    } finally {
      setIsSendingInvoice(false);
    }
  }

  async function cancelQueuedMessage(outboundMessageId: string) {
    if (!invoice) return;
    setCancelingMessageId(outboundMessageId);
    setNoticeMessage(null);
    try {
      await cancelOfficeInvoiceOutboundMessage({
        invoiceId: invoice.id,
        outboundMessageId,
        apiBaseUrl,
        sessionToken
      });
      await loadDeliveryHistory(invoice.id);
      setNoticeMessage('Queued email canceled.');
    } catch (error) {
      await loadDeliveryHistory(invoice.id, { silent: true });
      setErrorMessage(error instanceof Error ? error.message : 'Unable to cancel the email.');
    } finally {
      setCancelingMessageId((current) => (current === outboundMessageId ? null : current));
    }
  }

  return (
    <>
      <section style={styles.panel} aria-label="Job invoice draft">
        <div style={styles.row}>
          <h2 style={styles.heading}>Invoice draft</h2>
          <div style={styles.badgeRow}>
            {invoice ? (
              <span style={styles.badge}>{invoice.status === 'posted' ? 'Posted' : 'Draft'}</span>
            ) : null}
            {invoice ? (
              <button
                type="button"
                style={styles.button}
                onClick={() => void downloadInvoiceDocument()}
              >
                Download invoice
              </button>
            ) : null}
            {invoice && canEdit && invoice.status === 'draft' && !newLineDraft ? (
              <button
                type="button"
                style={styles.button}
                onClick={() => setNewLineDraft(createEmptyInvoiceLineDraft())}
              >
                Add line
              </button>
            ) : null}
            {invoice && canPost && invoice.status === 'draft' && !newLineDraft && !editingLineId ? (
              <button
                type="button"
                style={styles.primaryButton}
                disabled={isSaving}
                onClick={() => void postInvoice()}
              >
                Post invoice
              </button>
            ) : null}
            {invoice && canSend && invoice.status === 'posted' ? (
              <button type="button" style={styles.button} onClick={toggleDeliveryPanel}>
                {isDeliveryPanelOpen ? 'Hide email' : 'Email invoice'}
              </button>
            ) : null}
          </div>
        </div>

        {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
        {warningMessage ? <p style={styles.warning}>{warningMessage}</p> : null}
        {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

        {newLineDraft ? (
          <InvoiceLineEditor
            heading="New line"
            draft={newLineDraft}
            isSaving={isSaving}
            onChange={setNewLineDraft}
            onSave={() => void addLine()}
            onCancel={() => setNewLineDraft(null)}
          />
        ) : null}

        {isLoading ? (
          <p style={styles.muted}>Loading invoice draft…</p>
        ) : !invoice ? (
          <p style={styles.muted}>No invoice draft for this job yet.</p>
        ) : (
          <>
            {invoice.lineItems.length === 0 ? (
              <p style={styles.muted}>
                This draft is empty. Register work and converted estimates appear here.
              </p>
            ) : (
              <div style={styles.list}>
                {invoice.lineItems.map((line) =>
                  editingLineId === line.id && editDraft ? (
                    <InvoiceLineEditor
                      key={line.id}
                      heading={`Edit: ${line.description}`}
                      draft={editDraft}
                      isSaving={isSaving}
                      onChange={setEditDraft}
                      onSave={() => void saveEdit(line.id)}
                      onCancel={() => {
                        setEditingLineId(null);
                        setEditDraft(null);
                      }}
                    />
                  ) : (
                    <div key={line.id} style={styles.subpanel}>
                      <div style={styles.row}>
                        <div style={{ minWidth: 0 }}>
                          <strong>{line.description}</strong>
                          <p style={styles.tinyMuted}>
                            {invoiceLineKindLabels[line.kind]} ·{' '}
                            {invoiceSourceLabels[line.sourceKind]}
                            {line.sourceSyncState === 'detached' ? ' (edited)' : ''} ·{' '}
                            {line.quantity}
                            {line.unitOfMeasure ? ` ${line.unitOfMeasure}` : ''} ×{' '}
                            {formatCurrency(line.unitPrice)}
                            {line.taxable ? '' : ' · non-taxable'}
                          </p>
                        </div>
                        <div style={styles.badgeRow}>
                          <strong>{formatCurrency(line.lineSubtotal)}</strong>
                          {canEdit && invoice.status === 'draft' ? (
                            <>
                              <button
                                type="button"
                                style={styles.button}
                                onClick={() => {
                                  setEditingLineId(line.id);
                                  setEditDraft(buildInvoiceLineDraft(line));
                                  setNewLineDraft(null);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                style={styles.dangerButton}
                                onClick={() => void voidLine(line)}
                              >
                                Remove
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
            <InvoiceTotals invoice={invoice} />
            {invoice.posted ? <PostedInvoiceSummary posted={invoice.posted} /> : null}
            {invoice.status === 'posted' && canSend && isDeliveryPanelOpen ? (
              <DocumentDeliveryPanel
                documentLabel="Invoice"
                panelAriaLabel="Invoice delivery"
                showAcceptanceHistory={false}
                draft={deliveryDraft}
                deliveryStatus={deliveryStatus}
                history={outboundMessages}
                isHistoryLoading={isHistoryLoading}
                isPreviewLoading={isPreviewLoading}
                isSending={isSendingInvoice}
                cancelingMessageId={cancelingMessageId}
                onChange={(patch) => setDeliveryDraft((current) => ({ ...current, ...patch }))}
                onSend={() => void sendInvoiceEmail()}
                onCancelMessage={(outboundMessageId) => void cancelQueuedMessage(outboundMessageId)}
              />
            ) : null}
          </>
        )}
      </section>

      {invoice && invoice.status === 'posted' ? (
        <JobInvoiceCorrections
          jobId={jobId}
          mainInvoiceId={invoice.id}
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          canEdit={canEdit}
          canPost={canPost}
          canCreate={canCreateAdjustments}
          paymentPermissions={paymentPermissions}
        />
      ) : null}
    </>
  );
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'invoice';
}
