'use client';

import { useState } from 'react';
import type {
  InvoiceAdjustmentKind,
  InvoiceLineItemSummary,
  InvoiceSummary
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import {
  formatCurrency,
  InvoiceLineEditor,
  InvoiceTaxRateEditor,
  InvoiceTotals,
  invoiceSourceLabels,
  PostedInvoiceSummary
} from './job-invoice-shared';
import { invoiceLineKindLabels, type InvoiceLineDraft } from './job-invoice-types';

export const correctionKindLabels: Record<InvoiceAdjustmentKind, string> = {
  adjustment: 'Adjustment',
  credit: 'Credit'
};

export function CorrectionCard({
  correction,
  canEdit,
  canPost,
  isSaving,
  lineEdit,
  otherEditInProgress,
  onStartAddLine,
  onStartEditLine,
  onCancelLineEdit,
  onChangeLineDraft,
  onSaveLine,
  onRemoveLine,
  onPost,
  onSaveTaxRate
}: {
  correction: InvoiceSummary;
  canEdit: boolean;
  canPost: boolean;
  isSaving: boolean;
  lineEdit: { invoiceId: string; lineId: string | null; draft: InvoiceLineDraft } | null;
  otherEditInProgress: boolean;
  onStartAddLine: () => void;
  onStartEditLine: (line: InvoiceLineItemSummary) => void;
  onCancelLineEdit: () => void;
  onChangeLineDraft: (draft: InvoiceLineDraft) => void;
  onSaveLine: () => void;
  onRemoveLine: (line: InvoiceLineItemSummary) => void;
  onPost: () => void;
  onSaveTaxRate: (taxRateBasisPoints: number) => Promise<boolean>;
}) {
  const [isEditingTaxRate, setIsEditingTaxRate] = useState(false);
  const isDraft = correction.status === 'draft';
  const kindLabel =
    correctionKindLabels[correction.invoiceKind === 'credit' ? 'credit' : 'adjustment'];
  const isAddingLine = lineEdit !== null && lineEdit.lineId === null;
  const editingLineId = lineEdit?.lineId ?? null;
  const isBusyEditing = lineEdit !== null;
  // While a line is being edited on ANOTHER card, suppress this card's actions so a
  // stray click can't discard that unsaved edit (one editor is open at a time).
  const actionsEnabled = isDraft && canEdit && !isBusyEditing && !otherEditInProgress;

  return (
    <div style={styles.subpanel}>
      <div style={styles.row}>
        <strong>
          {kindLabel}
          {correction.invoiceNumber ? ` · ${correction.invoiceNumber}` : ''}
        </strong>
        <div style={styles.badgeRow}>
          <span style={styles.badge}>{isDraft ? 'Draft' : 'Posted'}</span>
          {actionsEnabled ? (
            <button type="button" style={styles.button} onClick={onStartAddLine}>
              Add line
            </button>
          ) : null}
          {actionsEnabled && !isEditingTaxRate ? (
            <button type="button" style={styles.button} onClick={() => setIsEditingTaxRate(true)}>
              Edit tax rate
            </button>
          ) : null}
          {isDraft &&
          canPost &&
          !isBusyEditing &&
          !otherEditInProgress &&
          correction.lineItems.length > 0 ? (
            <button type="button" style={styles.primaryButton} disabled={isSaving} onClick={onPost}>
              Post {kindLabel.toLowerCase()}
            </button>
          ) : null}
        </div>
      </div>

      {correction.lineItems.length === 0 ? (
        <p style={styles.tinyMuted}>No lines yet.</p>
      ) : (
        correction.lineItems.map((line) =>
          editingLineId === line.id && lineEdit ? (
            <InvoiceLineEditor
              key={line.id}
              heading={`Edit: ${line.description}`}
              draft={lineEdit.draft}
              isSaving={isSaving}
              onChange={onChangeLineDraft}
              onSave={onSaveLine}
              onCancel={onCancelLineEdit}
            />
          ) : (
            <div key={line.id} style={styles.row}>
              <div style={{ minWidth: 0 }}>
                <span>{line.description}</span>
                <p style={styles.tinyMuted}>
                  {invoiceLineKindLabels[line.kind]} · {invoiceSourceLabels[line.sourceKind]} ·{' '}
                  {line.quantity}
                  {line.unitOfMeasure ? ` ${line.unitOfMeasure}` : ''} ×{' '}
                  {formatCurrency(line.unitPrice)}
                  {line.taxable ? '' : ' · non-taxable'}
                </p>
              </div>
              <div style={styles.badgeRow}>
                <strong>{formatCurrency(line.lineSubtotal)}</strong>
                {actionsEnabled ? (
                  <>
                    <button
                      type="button"
                      style={styles.button}
                      onClick={() => onStartEditLine(line)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      style={styles.dangerButton}
                      onClick={() => onRemoveLine(line)}
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )
        )
      )}

      {isAddingLine && lineEdit ? (
        <InvoiceLineEditor
          heading={`New ${kindLabel.toLowerCase()} line`}
          draft={lineEdit.draft}
          isSaving={isSaving}
          onChange={onChangeLineDraft}
          onSave={onSaveLine}
          onCancel={onCancelLineEdit}
        />
      ) : null}

      {isEditingTaxRate && isDraft ? (
        <InvoiceTaxRateEditor
          taxRateBasisPoints={correction.taxRateBasisPoints}
          isSaving={isSaving}
          onSave={async (taxRateBasisPoints) => {
            const saved = await onSaveTaxRate(taxRateBasisPoints);
            if (saved) {
              setIsEditingTaxRate(false);
            }
            return saved;
          }}
          onCancel={() => setIsEditingTaxRate(false)}
        />
      ) : null}

      <InvoiceTotals invoice={correction} />
      {correction.posted ? <PostedInvoiceSummary posted={correction.posted} /> : null}
    </div>
  );
}
