'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  approveOfficeEstimate,
  convertOfficeEstimateToInvoice,
  createOfficeEstimate,
  declineOfficeEstimate,
  downloadOfficeEstimatePdf,
  getOfficeCatalogCategories,
  getOfficeEstimateOutboundMessages,
  getOfficeEstimateSendPreview,
  getOfficeCatalogItems,
  getOfficeEstimatesForJob,
  sendOfficeEstimate,
  updateOfficeEstimate,
  type CatalogCategory,
  type CatalogItem,
  type EstimateEmailDeliveryStatus,
  type EstimateSummary,
  type OutboundMessageSummary
} from '@/lib/operations-api';
import { downloadBlob } from '@/lib/download-file';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { EstimateDeliveryPanel, type EstimateDeliveryDraft } from './job-estimate-delivery-panel';
import { EstimateEditor } from './job-estimate-editor';
import {
  buildEstimateDraftFromSummary,
  createEmptyEstimateDraft,
  parseEstimateDraft,
  type EstimateDraft
} from './job-estimate-types';
import { EstimateDetailPanel, EstimateList } from './job-estimate-review';

type JobEstimatesSectionProps = {
  jobId: string;
  apiBaseUrl: string;
  sessionToken: string;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canSend: boolean;
  canConvert: boolean;
  canViewCatalog: boolean;
  billToCustomerEmail?: string;
};

type CatalogLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

// Estimates attach to a job, so this section lives inside the job detail surface.
// It is self-contained: it fetches its own estimates and owns its draft state,
// mirroring how the CRM panel manages its own data. All styling reuses
// officeWorkspaceStyles so it reads as a native part of the office app.
export function JobEstimatesSection({
  jobId,
  apiBaseUrl,
  sessionToken,
  canCreate,
  canEdit,
  canApprove,
  canSend,
  canConvert,
  canViewCatalog,
  billToCustomerEmail
}: JobEstimatesSectionProps) {
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);
  const [catalogSearchText, setCatalogSearchText] = useState('');
  const [catalogLoadStatus, setCatalogLoadStatus] = useState<CatalogLoadStatus>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<EstimateDraft | null>(null);
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deliveryPanelEstimateId, setDeliveryPanelEstimateId] = useState<string | null>(null);
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<string, EstimateDeliveryDraft>>({});
  const [outboundMessagesByEstimateId, setOutboundMessagesByEstimateId] = useState<
    Record<string, OutboundMessageSummary[]>
  >({});
  const [historyLoadingEstimateId, setHistoryLoadingEstimateId] = useState<string | null>(null);
  const [previewLoadingEstimateId, setPreviewLoadingEstimateId] = useState<string | null>(null);
  const [sendingEstimateId, setSendingEstimateId] = useState<string | null>(null);
  const [deliveryStatusByEstimateId, setDeliveryStatusByEstimateId] = useState<
    Record<string, EstimateEmailDeliveryStatus>
  >({});

  const loadEstimates = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getOfficeEstimatesForJob({ jobId, apiBaseUrl, sessionToken });
      setEstimates(response.estimates);
      setSelectedEstimateId((current) => {
        if (current && response.estimates.some((estimate) => estimate.id === current)) {
          return current;
        }
        return pickDefaultEstimate(response.estimates)?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load estimates.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, jobId, sessionToken]);

  useEffect(() => {
    void loadEstimates();
  }, [loadEstimates]);

  const selectedEstimate = useMemo(
    () => estimates.find((estimate) => estimate.id === selectedEstimateId) ?? null,
    [estimates, selectedEstimateId]
  );

  const loadCatalog = useCallback(async () => {
    if (!canViewCatalog) {
      return;
    }
    setCatalogLoadStatus('loading');
    try {
      const [itemsResponse, categoriesResponse] = await Promise.all([
        getOfficeCatalogItems({ apiBaseUrl, sessionToken }),
        getOfficeCatalogCategories({ apiBaseUrl, sessionToken })
      ]);
      setCatalogItems(itemsResponse.items);
      setCatalogCategories(categoriesResponse.categories);
      setCatalogLoadStatus('loaded');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the Catalog.');
      setCatalogLoadStatus('error');
    }
  }, [apiBaseUrl, canViewCatalog, sessionToken]);

  useEffect(() => {
    if (draft && canViewCatalog && catalogLoadStatus === 'idle') {
      void loadCatalog();
    }
  }, [canViewCatalog, catalogLoadStatus, draft, loadCatalog]);

  function startNewEstimate() {
    setEditingEstimateId(null);
    setDraft(createEmptyEstimateDraft());
    setCatalogLoadStatus('idle');
    setNoticeMessage(null);
    setErrorMessage(null);
  }

  function startEditEstimate(estimate: EstimateSummary) {
    setSelectedEstimateId(estimate.id);
    setEditingEstimateId(estimate.id);
    setDraft(buildEstimateDraftFromSummary(estimate));
    setCatalogLoadStatus('idle');
    setNoticeMessage(null);
    setErrorMessage(null);
  }

  function cancelDraft() {
    setDraft(null);
    setEditingEstimateId(null);
  }

  async function saveDraft() {
    if (!draft) {
      return;
    }

    const parsed = parseEstimateDraft(draft);
    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      if (editingEstimateId) {
        const response = await updateOfficeEstimate({
          estimateId: editingEstimateId,
          apiBaseUrl,
          sessionToken,
          ...parsed.value
        });
        setSelectedEstimateId(response.estimate.id);
        setNoticeMessage('Estimate updated.');
      } else {
        const response = await createOfficeEstimate({
          jobId,
          apiBaseUrl,
          sessionToken,
          ...parsed.value
        });
        setSelectedEstimateId(response.estimate.id);
        setNoticeMessage('Estimate created.');
      }
      cancelDraft();
      await loadEstimates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the estimate.');
    } finally {
      setIsSaving(false);
    }
  }

  async function approve(estimateId: string, selectedOptionId?: string) {
    if (
      !window.confirm('Mark this estimate approved? Approved estimates can no longer be edited.')
    ) {
      return;
    }
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await approveOfficeEstimate({ estimateId, selectedOptionId, apiBaseUrl, sessionToken });
      setNoticeMessage('Estimate approved.');
      await loadEstimates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to approve the estimate.');
    }
  }

  async function decline(estimateId: string) {
    if (!window.confirm('Decline this estimate?')) {
      return;
    }
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await declineOfficeEstimate({ estimateId, apiBaseUrl, sessionToken });
      setNoticeMessage('Estimate declined.');
      await loadEstimates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to decline the estimate.');
    }
  }

  async function convert(estimateId: string, mode?: 'append' | 'replace') {
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await convertOfficeEstimateToInvoice({ estimateId, mode, apiBaseUrl, sessionToken });
      setNoticeMessage('Estimate converted to the invoice draft. See the Invoice tab.');
      await loadEstimates();
    } catch (error) {
      // The API blocks with a choice when the draft already has lines; offer it.
      const message = error instanceof Error ? error.message : 'Unable to convert the estimate.';
      if (!mode && /append.*replace|replace.*append/i.test(message)) {
        const replace = window.confirm(
          'The invoice draft already has lines.\n\nOK = replace them with this estimate.\nCancel = add this estimate to the existing lines.'
        );
        await convert(estimateId, replace ? 'replace' : 'append');
        return;
      }
      setErrorMessage(message);
    }
  }

  async function downloadEstimate(estimate: EstimateSummary) {
    setErrorMessage(null);
    try {
      const blob = await downloadOfficeEstimatePdf({
        estimateId: estimate.id,
        apiBaseUrl,
        sessionToken
      });
      downloadBlob(`estimate-${safeFilenamePart(estimate.title)}-${estimate.id}.pdf`, blob);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download the estimate.');
    }
  }

  async function loadDeliveryHistory(estimateId: string) {
    setHistoryLoadingEstimateId(estimateId);
    setErrorMessage(null);
    try {
      const response = await getOfficeEstimateOutboundMessages({
        estimateId,
        apiBaseUrl,
        sessionToken
      });
      setOutboundMessagesByEstimateId((current) => ({
        ...current,
        [estimateId]: response.outboundMessages
      }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load estimate delivery history.'
      );
    } finally {
      setHistoryLoadingEstimateId((current) => (current === estimateId ? null : current));
    }
  }

  async function loadSendPreview(estimateId: string) {
    setPreviewLoadingEstimateId(estimateId);
    setErrorMessage(null);
    try {
      const response = await getOfficeEstimateSendPreview({
        estimateId,
        apiBaseUrl,
        sessionToken
      });
      setDeliveryStatusByEstimateId((current) => ({
        ...current,
        [estimateId]: response.deliveryStatus
      }));
      setDeliveryDrafts((current) => {
        const existing = current[estimateId] ?? {
          recipientEmail: billToCustomerEmail ?? '',
          subject: '',
          bodyText: ''
        };
        return {
          ...current,
          [estimateId]: {
            ...existing,
            subject: existing.subject || response.preview.subject,
            bodyText: existing.bodyText || response.preview.bodyText
          }
        };
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load send preview.');
    } finally {
      setPreviewLoadingEstimateId((current) => (current === estimateId ? null : current));
    }
  }

  function toggleDeliveryPanel(estimate: EstimateSummary) {
    setNoticeMessage(null);
    setErrorMessage(null);
    setDeliveryPanelEstimateId((current) => {
      const next = current === estimate.id ? null : estimate.id;
      if (next) {
        setDeliveryDrafts((drafts) => ({
          ...drafts,
          [estimate.id]: drafts[estimate.id] ?? {
            recipientEmail: billToCustomerEmail ?? '',
            subject: '',
            bodyText: ''
          }
        }));
        void loadDeliveryHistory(estimate.id);
        void loadSendPreview(estimate.id);
      }
      return next;
    });
  }

  function updateDeliveryDraft(estimateId: string, patch: Partial<EstimateDeliveryDraft>) {
    setDeliveryDrafts((current) => ({
      ...current,
      [estimateId]: {
        ...(current[estimateId] ?? {
          recipientEmail: billToCustomerEmail ?? '',
          subject: '',
          bodyText: ''
        }),
        ...patch
      }
    }));
  }

  async function sendEstimate(estimate: EstimateSummary) {
    const draft = deliveryDrafts[estimate.id];
    const recipientEmail = draft?.recipientEmail.trim() ?? '';
    if (!recipientEmail) {
      setErrorMessage('Recipient email is required.');
      return;
    }
    if (!window.confirm(`Send this estimate PDF to ${recipientEmail}?`)) {
      return;
    }

    setSendingEstimateId(estimate.id);
    setErrorMessage(null);
    setNoticeMessage(null);
    setWarningMessage(null);
    try {
      const response = await sendOfficeEstimate({
        estimateId: estimate.id,
        apiBaseUrl,
        sessionToken,
        recipientEmail,
        subject: draft?.subject.trim() || undefined,
        bodyText: draft?.bodyText.trim() || undefined
      });
      // Refresh history first: loadDeliveryHistory clears errorMessage, so a
      // failure message set before it would be wiped immediately.
      await loadDeliveryHistory(estimate.id);
      if (response.outboundMessage.status === 'sent') {
        // Reload so the list picks up the new Sent state.
        await loadEstimates();
        if (response.recordingIncomplete) {
          setWarningMessage(
            'The email was sent, but BellField could not finish recording it. Do not resend until support checks it.'
          );
        } else {
          setNoticeMessage('Estimate sent.');
        }
      } else {
        setErrorMessage(response.outboundMessage.deliveryMessage ?? 'Estimate delivery failed.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send the estimate.');
    } finally {
      setSendingEstimateId((current) => (current === estimate.id ? null : current));
    }
  }

  return (
    <section style={styles.panel} aria-label="Job estimates">
      <div style={styles.row}>
        <h2 style={styles.heading}>Estimates</h2>
        {canCreate && !draft ? (
          <button type="button" style={styles.primaryButton} onClick={startNewEstimate}>
            New estimate
          </button>
        ) : null}
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      {warningMessage ? <p style={styles.warning}>{warningMessage}</p> : null}
      {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

      {draft ? (
        <EstimateEditor
          draft={draft}
          isSaving={isSaving}
          isEditing={editingEstimateId !== null}
          taxRateBasisPoints={
            estimates.find((estimate) => estimate.id === editingEstimateId)?.taxRateBasisPoints
          }
          canViewCatalog={canViewCatalog}
          catalogItems={catalogItems}
          catalogCategories={catalogCategories}
          catalogSearchText={catalogSearchText}
          isCatalogLoading={catalogLoadStatus === 'loading'}
          onChange={setDraft}
          onCatalogSearchChange={setCatalogSearchText}
          onReloadCatalog={() => void loadCatalog()}
          onCancel={cancelDraft}
          onSave={() => void saveDraft()}
        />
      ) : null}

      {isLoading ? (
        <p style={styles.muted}>Loading estimates…</p>
      ) : estimates.length === 0 ? (
        !draft ? (
          <p style={styles.muted}>No estimates yet for this job.</p>
        ) : null
      ) : (
        <div style={{ ...styles.splitGrid, alignItems: 'start' }}>
          <EstimateList
            estimates={estimates}
            selectedEstimateId={selectedEstimateId}
            onSelect={setSelectedEstimateId}
          />
          {selectedEstimate ? (
            <EstimateDetailPanel
              estimate={selectedEstimate}
              canEdit={canEdit}
              canApprove={canApprove}
              canSend={canSend}
              canConvert={canConvert}
              isDeliveryPanelOpen={deliveryPanelEstimateId === selectedEstimate.id}
              deliveryPanel={
                deliveryPanelEstimateId === selectedEstimate.id ? (
                  <EstimateDeliveryPanel
                    draft={
                      deliveryDrafts[selectedEstimate.id] ?? {
                        recipientEmail: '',
                        subject: '',
                        bodyText: ''
                      }
                    }
                    deliveryStatus={deliveryStatusByEstimateId[selectedEstimate.id] ?? null}
                    history={outboundMessagesByEstimateId[selectedEstimate.id] ?? []}
                    isHistoryLoading={historyLoadingEstimateId === selectedEstimate.id}
                    isPreviewLoading={previewLoadingEstimateId === selectedEstimate.id}
                    isSending={sendingEstimateId === selectedEstimate.id}
                    onChange={(patch) => updateDeliveryDraft(selectedEstimate.id, patch)}
                    onSend={() => void sendEstimate(selectedEstimate)}
                  />
                ) : null
              }
              onEdit={() => startEditEstimate(selectedEstimate)}
              onApprove={(selectedOptionId) => void approve(selectedEstimate.id, selectedOptionId)}
              onDecline={() => void decline(selectedEstimate.id)}
              onConvert={() => void convert(selectedEstimate.id)}
              onDownload={() => void downloadEstimate(selectedEstimate)}
              onToggleDelivery={() => toggleDeliveryPanel(selectedEstimate)}
            />
          ) : (
            <p style={styles.muted}>Choose an estimate to review.</p>
          )}
        </div>
      )}
    </section>
  );
}

function pickDefaultEstimate(estimates: EstimateSummary[]): EstimateSummary | undefined {
  return (
    estimates.find(
      (estimate) => estimate.status !== 'declined' && !estimate.supersededByEstimateId
    ) ?? estimates[0]
  );
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'estimate';
}
