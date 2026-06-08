'use client';

import { useState } from 'react';
import type { CatalogItem } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { EstimateCatalogPicker } from './job-estimate-catalog-picker';
import {
  createDefaultEstimateOptionGroup,
  estimateLineItemKindLabels,
  estimateLineItemKindOptions,
  isUntouchedBlankEstimateLine,
  type EstimateDraft,
  type EstimateLineDraft
} from './job-estimate-types';

type EstimateEditorProps = {
  draft: EstimateDraft;
  isSaving: boolean;
  isEditing: boolean;
  canViewCatalog: boolean;
  catalogItems: CatalogItem[];
  catalogSearchText: string;
  isCatalogLoading: boolean;
  onChange: (draft: EstimateDraft) => void;
  onCatalogSearchChange: (value: string) => void;
  onReloadCatalog: () => void;
  onCancel: () => void;
  onSave: () => void;
};

type LineTarget = { kind: 'base' } | { kind: 'option'; groupId: string; optionId: string };

export function EstimateEditor({
  draft,
  isSaving,
  isEditing,
  canViewCatalog,
  catalogItems,
  catalogSearchText,
  isCatalogLoading,
  onChange,
  onCatalogSearchChange,
  onReloadCatalog,
  onCancel,
  onSave
}: EstimateEditorProps) {
  const optionGroup = draft.optionGroups[0];
  const [activeTargetId, setActiveTargetId] = useState('base');
  const activeTarget = resolveLineTarget(activeTargetId, optionGroup);
  const visibleLines = draft.lineItems
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => lineMatchesTarget(line, activeTarget));

  function patch(values: Partial<EstimateDraft>) {
    onChange({ ...draft, ...values });
  }

  function patchLine(index: number, values: Partial<EstimateLineDraft>) {
    onChange({
      ...draft,
      lineItems: draft.lineItems.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...values } : line
      )
    });
  }

  function patchOption(optionId: string, label: string) {
    onChange({
      ...draft,
      optionGroups: draft.optionGroups.map((group) => ({
        ...group,
        options: group.options.map((option) =>
          option.id === optionId ? { ...option, label } : option
        )
      }))
    });
  }

  function enableOptions() {
    const group = createDefaultEstimateOptionGroup();
    onChange({
      ...draft,
      optionGroups: [group],
      selectedOptionId: draft.selectedOptionId || group.options[0]?.id || ''
    });
    setActiveTargetId(group.options[0]?.id ?? 'base');
  }

  function addLine() {
    onChange({
      ...draft,
      lineItems: [
        ...draft.lineItems,
        withTarget(
          {
            kind: 'part',
            description: '',
            quantity: '1',
            unitOfMeasure: '',
            unitPrice: '',
            unitCost: '',
            taxable: true
          },
          activeTarget
        )
      ]
    });
  }

  function addCatalogLine(line: EstimateLineDraft) {
    const targetedLine = withTarget(line, activeTarget);
    onChange({
      ...draft,
      lineItems:
        draft.lineItems.length === 1 && isUntouchedBlankEstimateLine(draft.lineItems[0])
          ? [targetedLine]
          : [...draft.lineItems, targetedLine]
    });
  }

  function removeLine(index: number) {
    onChange({
      ...draft,
      lineItems: draft.lineItems.filter((_, lineIndex) => lineIndex !== index)
    });
  }

  return (
    <div style={styles.drawerPanel}>
      <h3 style={styles.sectionHeading}>{isEditing ? 'Edit estimate' : 'New estimate'}</h3>

      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          <span>Title</span>
          <input
            style={styles.input}
            value={draft.title}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </label>
        <label style={styles.fieldLabel}>
          <span>Tax rate (%)</span>
          <input
            style={styles.input}
            type="number"
            step="0.01"
            value={draft.taxRatePercent}
            onChange={(event) => patch({ taxRatePercent: event.target.value })}
          />
        </label>
        <label style={styles.fieldLabel}>
          <span>Valid until</span>
          <input
            style={styles.input}
            type="date"
            value={draft.validUntil}
            onChange={(event) => patch({ validUntil: event.target.value })}
          />
        </label>
      </div>

      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          <span>Discount type</span>
          <select
            style={styles.input}
            value={draft.discountKind}
            onChange={(event) =>
              patch({ discountKind: event.target.value as EstimateDraft['discountKind'] })
            }
          >
            <option value="none">None</option>
            <option value="percent">Percent (%)</option>
            <option value="fixed">Fixed ($)</option>
          </select>
        </label>
        {draft.discountKind !== 'none' ? (
          <label style={styles.fieldLabel}>
            <span>{draft.discountKind === 'percent' ? 'Discount (%)' : 'Discount ($)'}</span>
            <input
              style={styles.input}
              type="number"
              step="0.01"
              value={draft.discountValue}
              onChange={(event) => patch({ discountValue: event.target.value })}
            />
          </label>
        ) : null}
      </div>

      <div style={styles.formSection}>
        <div style={styles.row}>
          <h4 style={styles.sectionHeading}>Line items</h4>
          <div style={styles.inlineActionBar}>
            {optionGroup ? null : (
              <button type="button" style={styles.button} onClick={enableOptions}>
                Add options
              </button>
            )}
            <button type="button" style={styles.button} onClick={addLine}>
              Add line
            </button>
          </div>
        </div>

        {optionGroup ? (
          <div style={styles.subpanel}>
            <div style={styles.inlineActionBar}>
              <button
                type="button"
                style={activeTargetId === 'base' ? styles.primaryButton : styles.button}
                onClick={() => setActiveTargetId('base')}
              >
                Base
              </button>
              {optionGroup.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  style={activeTargetId === option.id ? styles.primaryButton : styles.button}
                  onClick={() => setActiveTargetId(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div style={styles.formGridCompact}>
              {optionGroup.options.map((option) => (
                <label key={option.id} style={styles.fieldLabel}>
                  <span>
                    {option.position === 0 ? 'Good' : option.position === 1 ? 'Better' : 'Best'}
                  </span>
                  <input
                    style={styles.input}
                    value={option.label}
                    onChange={(event) => patchOption(option.id, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {canViewCatalog ? (
          <EstimateCatalogPicker
            items={catalogItems}
            searchText={catalogSearchText}
            isLoading={isCatalogLoading}
            onSearchChange={onCatalogSearchChange}
            onReload={onReloadCatalog}
            onAddLine={addCatalogLine}
          />
        ) : null}

        {visibleLines.length === 0 ? (
          <p style={styles.tinyMuted}>Add at least one line item.</p>
        ) : (
          visibleLines.map(({ line, index }) => (
            <div key={index} style={styles.subpanel}>
              <div style={styles.formGridCompact}>
                <label style={styles.fieldLabel}>
                  <span>Kind</span>
                  <select
                    style={styles.input}
                    value={line.kind}
                    onChange={(event) =>
                      patchLine(index, { kind: event.target.value as EstimateLineDraft['kind'] })
                    }
                  >
                    {estimateLineItemKindOptions.map((kind) => (
                      <option key={kind} value={kind}>
                        {estimateLineItemKindLabels[kind]}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
                  <span>Description</span>
                  <input
                    style={styles.input}
                    value={line.description}
                    onChange={(event) => patchLine(index, { description: event.target.value })}
                  />
                </label>
              </div>
              <div style={styles.formGridCompact}>
                <label style={styles.fieldLabel}>
                  <span>Qty</span>
                  <input
                    style={styles.input}
                    type="number"
                    step="0.01"
                    value={line.quantity}
                    onChange={(event) => patchLine(index, { quantity: event.target.value })}
                  />
                </label>
                <label style={styles.fieldLabel}>
                  <span>Unit price</span>
                  <input
                    style={styles.input}
                    type="number"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) => patchLine(index, { unitPrice: event.target.value })}
                  />
                </label>
                <label style={styles.fieldLabel}>
                  <span>Unit cost</span>
                  <input
                    style={styles.input}
                    type="number"
                    step="0.01"
                    value={line.unitCost}
                    onChange={(event) => patchLine(index, { unitCost: event.target.value })}
                  />
                </label>
                <label style={styles.inlineLabel}>
                  <input
                    type="checkbox"
                    checked={line.taxable}
                    onChange={(event) => patchLine(index, { taxable: event.target.checked })}
                  />
                  <span>Taxable</span>
                </label>
              </div>
              <div style={styles.row}>
                <span style={styles.tinyMuted}>Line {index + 1}</span>
                <button type="button" style={styles.dangerButton} onClick={() => removeLine(index)}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={styles.inlineActionBar}>
        <button type="button" style={styles.primaryButton} disabled={isSaving} onClick={onSave}>
          {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Create estimate'}
        </button>
        <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function resolveLineTarget(
  activeTargetId: string,
  optionGroup: EstimateDraft['optionGroups'][number] | undefined
): LineTarget {
  const option = optionGroup?.options.find((candidate) => candidate.id === activeTargetId);
  if (!optionGroup || !option) {
    return { kind: 'base' };
  }
  return { kind: 'option', groupId: optionGroup.id, optionId: option.id };
}

function lineMatchesTarget(line: EstimateLineDraft, target: LineTarget): boolean {
  if (target.kind === 'base') {
    return !line.optionId;
  }
  return line.optionGroupId === target.groupId && line.optionId === target.optionId;
}

function withTarget(line: EstimateLineDraft, target: LineTarget): EstimateLineDraft {
  if (target.kind === 'base') {
    const { optionGroupId, optionId, ...baseLine } = line;
    void optionGroupId;
    void optionId;
    return baseLine;
  }
  return { ...line, optionGroupId: target.groupId, optionId: target.optionId };
}
