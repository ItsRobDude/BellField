'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /**
   * Lets the host panel ask "may I navigate away?" before unmounting this
   * section, so a dirty estimate draft is not silently destroyed by a tab
   * switch. The guard returns true when navigation may proceed.
   */
  onUnsavedChangesGuardChange?: (guard: (() => boolean) | null) => void;
};

type CatalogLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

type PendingEstimateAction = {
  estimateId: string;
  kind: 'approve' | 'decline' | 'convert' | 'download';
};

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
  billToCustomerEmail,
  onUnsavedChangesGuardChange
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
  const [pendingAction, setPendingAction] = useState<PendingEstimateAction | null>(null);
  // Ref mirror of pendingAction: a double-click fires both handlers in the
  // same tick, before React re-renders with the disabled state.
  const pendingActionRef = useRef<PendingEstimateAction | null>(null);
  const [convertChoiceEstimateId, setConvertChoiceEstimateId] = useState<string | null>(null);
  const isDraftDirtyRef = useRef(false);

  useEffect(() => {
    if (!onUnsavedChangesGuardChange) {
      return;
    }
    onUnsavedChangesGuardChange(() => {
      if (!isDraftDirtyRef.current) {
        return true;
      }
      return window.confirm('Discard unsaved estimate changes?');
    });
    return () => onUnsavedChangesGuardChange(null);
  }, [onUnsavedChangesGuardChange]);

  function beginAction(action: PendingEstimateAction): boolean {
    if (pendingActionRef.current) {
      return false;
    }
    pendingActionRef.current = action;
    setPendingAction(action);
    return true;
  }

  function endAction() {
    pendingActionRef.current = null;
    setPendingAction(null);
  }

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

  function confirmDiscardDraft(): boolean {
    if (!draft || !isDraftDirtyRef.current) {
      return true;
    }
    return window.confirm('Discard unsaved estimate changes?');
  }

  function startNewEstimate() {
    if (!confirmDiscardDraft()) {
      return;
    }
    isDraftDirtyRef.current = false;
    setEditingEstimateId(null);
    setDraft(createEmptyEstimateDraft());
    setCatalogLoadStatus('idle');
    setNoticeMessage(null);
    setErrorMessage(null);
  }

  function startEditEstimate(estimate: EstimateSummary) {
    if (!confirmDiscardDraft()) {
      return;
    }
    isDraftDirtyRef.current = false;
    setSelectedEstimateId(estimate.id);
    setEditingEstimateId(estimate.id);
    setDraft(buildEstimateDraftFromSummary(estimate));
    setCatalogLoadStatus('idle');
    setNoticeMessage(null);
    setErrorMessage(null);
  }

  function changeDraft(next: EstimateDraft) {
    isDraftDirtyRef.current = true;
    setDraft(next);
  }

  function cancelDraft() {
    isDraftDirtyRef.current = false;
    setDraft(null);
    setEditingEstimateId(null);
  }

  function requestCancelDraft() {
    if (!confirmDiscardDraft()) {
      return;
    }
    cancelDraft();
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
    if (!beginAction({ estimateId, kind: 'approve' })) {
      return;
    }
    try {
      if (
        !window.confirm('Mark this estimate approved? Approved estimates can no longer be edited.')
      ) {
        return;
      }
      setErrorMessage(null);
      setNoticeMessage(null);
      await approveOfficeEstimate({ estimateId, selectedOptionId, apiBaseUrl, sessionToken });
      setNoticeMessage('Estimate approved.');
      await loadEstimates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to approve the estimate.');
    } finally {
      endAction();
    }
  }

  async function decline(estimateId: string) {
    if (!beginAction({ estimateId, kind: 'decline' })) {
      return;
    }
    try {
      if (!window.confirm('Decline this estimate?')) {
        return;
      }
      setErrorMessage(null);
      setNoticeMessage(null);
      await declineOfficeEstimate({ estimateId, apiBaseUrl, sessionToken });
      setNoticeMessage('Estimate declined.');
      await loadEstimates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to decline the estimate.');
    } finally {
      endAction();
    }
  }

  async function convert(estimateId: string, mode?: 'append' | 'replace') {
    if (!beginAction({ estimateId, kind: 'convert' })) {
      return;
    }
    setConvertChoiceEstimateId(null);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      await convertOfficeEstimateToInvoice({ estimateId, mode, apiBaseUrl, sessionToken });
      setNoticeMessage('Estimate converted to the invoice draft. See the Invoice tab.');
      await loadEstimates();
    } catch (error) {
      // The API blocks with a choice when the draft already has lines; show a
      // real three-way prompt instead of overloading OK/Cancel with two
      // different destructive meanings.
      const message = error instanceof Error ? error.message : 'Unable to convert the estimate.';
      if (!mode && /append.*replace|replace.*append/i.test(message)) {
        setConvertChoiceEstimateId(estimateId);
      } else {
        setErrorMessage(message);
      }
    } finally {
      endAction();
    }
  }

  async function downloadEstimate(estimate: EstimateSummary) {
    if (!beginAction({ estimateId: estimate.id, kind: 'download' })) {
      return;
    }
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
    } finally {
      endAction();
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
    // Side effects stay outside the setState updater: React requires updaters
    // to be pure, and StrictMode double-invokes them.
    const next = deliveryPanelEstimateId === estimate.id ? null : estimate.id;
    setDeliveryPanelEstimateId(next);
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
          key={editingEstimateId ?? 'new'}
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
          catalogLoadFailed={catalogLoadStatus === 'error'}
          onChange={changeDraft}
          onCatalogSearchChange={setCatalogSearchText}
          onReloadCatalog={() => void loadCatalog()}
          onCancel={requestCancelDraft}
          onSave={() => void saveDraft()}
        />
      ) : null}

      {convertChoiceEstimateId && convertChoiceEstimateId === selectedEstimateId ? (
        <div style={styles.warning} role="alertdialog" aria-label="Invoice draft already has lines">
          <p style={{ margin: 0 }}>
            The invoice draft already has lines. What should happen to them?
          </p>
          <div style={styles.inlineActionBar}>
            <button
              type="button"
              style={styles.dangerButton}
              onClick={() => void convert(convertChoiceEstimateId, 'replace')}
            >
              Replace them with this estimate
            </button>
            <button
              type="button"
              style={styles.button}
              onClick={() => void convert(convertChoiceEstimateId, 'append')}
            >
              Add this estimate to them
            </button>
            <button
              type="button"
              style={styles.button}
              onClick={() => setConvertChoiceEstimateId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
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
              isActionPending={pendingAction?.estimateId === selectedEstimate.id}
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
