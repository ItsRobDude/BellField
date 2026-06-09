import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type {
  FieldCatalogItem,
  FieldTruckStockItem,
  RegisterEntryKind
} from '@/lib/operations-api';
import { formatAppointmentSchedule } from './field-appointment-display';
import {
  buildPricedRegisterDraftPatch,
  createCatalogRegisterDraftPatch,
  createRegisterEntryDraft,
  formatCurrency,
  formatRegisterEntryKind,
  isLocalRegisterEntry,
  type RegisterEntryDraft
} from './field-workspace-drafts';
import {
  buildRegisterSearchResults,
  findTruckMatchForCatalogItem,
  type RegisterSearchResult
} from './field-register-search';
import {
  formatDraftTotalLabel,
  isDraftCoherentForSelectedResult,
  resolveRegisterComposerAfterAddAttempt
} from './field-register-composer-state';
import { createRegisterAddLineGate } from './field-register-submit-guard';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';
import type { FieldJob, FieldRegisterEntry } from './field-workspace-types';

const registerEntryKinds: RegisterEntryKind[] = [
  'labor',
  'serviceItem',
  'part',
  'membership',
  'other'
];

type RegisterTabProps = {
  job: FieldJob;
  registerCreateDrafts: Record<string, RegisterEntryDraft>;
  registerEditDrafts: Record<string, RegisterEntryDraft>;
  catalogItems: FieldCatalogItem[];
  truckStockItems: FieldTruckStockItem[];
  onConfirmVoidRegisterEntry: (entry: FieldRegisterEntry) => void;
  onQueueRegisterEntryCreate: (job: FieldJob) => Promise<boolean>;
  onQueueRegisterEntryEdit: (entry: FieldRegisterEntry) => void;
  onUpdateRegisterCreateDraft: (jobId: string, patch: Partial<RegisterEntryDraft>) => void;
  onUpdateRegisterEditDraft: (
    entry: FieldRegisterEntry,
    patch: Partial<RegisterEntryDraft>
  ) => void;
};

export function RegisterTab({
  job,
  registerCreateDrafts,
  registerEditDrafts,
  catalogItems,
  truckStockItems,
  onConfirmVoidRegisterEntry,
  onQueueRegisterEntryCreate,
  onQueueRegisterEntryEdit,
  onUpdateRegisterCreateDraft,
  onUpdateRegisterEditDraft
}: RegisterTabProps) {
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitleSmall}>Register</Text>
      {(job.registerEntries ?? []).length === 0 ? (
        <Text style={styles.summaryText}>No work lines saved yet.</Text>
      ) : (
        <View style={styles.replacementOptionList}>
          {(job.registerEntries ?? []).map((entry) => {
            const editDraft = registerEditDrafts[entry.id] ?? createRegisterEntryDraft(entry);
            const isLocalEntry = isLocalRegisterEntry(entry);
            const isExpanded = expandedEntryId === entry.id;

            return (
              <View key={entry.id} style={styles.queueItem}>
                <Pressable
                  disabled={entry.isVoid || isLocalEntry}
                  onPress={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                  style={styles.registerLineSummary}
                >
                  <View style={styles.flexColumn}>
                    <Text style={styles.replacementOptionLabel}>{entry.description}</Text>
                    <Text style={styles.summaryText}>{formatEntrySummary(entry)}</Text>
                    {entry.inventorySourceLabel ? (
                      <Text style={styles.summaryText}>Source: {entry.inventorySourceLabel}</Text>
                    ) : null}
                  </View>
                  <View style={styles.registerLineAmount}>
                    <Text style={styles.replacementOptionLabel}>
                      {formatCurrency(entry.totalAmount)}
                    </Text>
                    {entry.isVoid ? <Text style={styles.errorText}>Voided</Text> : null}
                    {isLocalEntry ? <Text style={styles.pendingText}>Queued</Text> : null}
                  </View>
                </Pressable>
                {entry.voidReason ? (
                  <Text style={styles.pendingText}>Void reason: {entry.voidReason}</Text>
                ) : null}
                {isLocalEntry ? (
                  <Text style={styles.pendingText}>
                    This line is waiting to sync. Use the pending queue if it needs review.
                  </Text>
                ) : null}
                {!entry.isVoid && !isLocalEntry && isExpanded ? (
                  <RegisterLineAdvancedEditor
                    draft={editDraft}
                    job={job}
                    onChange={(patch) => onUpdateRegisterEditDraft(entry, patch)}
                    saveLabel="Save details"
                    onSave={() => onQueueRegisterEntryEdit(entry)}
                    onVoid={() => onConfirmVoidRegisterEntry(entry)}
                    showVoid
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <RegisterCreateCard
        job={job}
        registerCreateDrafts={registerCreateDrafts}
        catalogItems={catalogItems}
        truckStockItems={truckStockItems}
        onQueueRegisterEntryCreate={onQueueRegisterEntryCreate}
        onUpdateRegisterCreateDraft={onUpdateRegisterCreateDraft}
      />
    </View>
  );
}

function RegisterCreateCard({
  job,
  registerCreateDrafts,
  catalogItems,
  truckStockItems,
  onQueueRegisterEntryCreate,
  onUpdateRegisterCreateDraft
}: {
  job: FieldJob;
  registerCreateDrafts: Record<string, RegisterEntryDraft>;
  catalogItems: FieldCatalogItem[];
  truckStockItems: FieldTruckStockItem[];
  onQueueRegisterEntryCreate: (job: FieldJob) => Promise<boolean>;
  onUpdateRegisterCreateDraft: (jobId: string, patch: Partial<RegisterEntryDraft>) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedResult, setSelectedResult] = useState<RegisterSearchResult | null>(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const addLineGateRef = useRef<ReturnType<typeof createRegisterAddLineGate> | null>(null);
  const createDraft = registerCreateDrafts[job.id] ?? createRegisterEntryDraft();
  const results = useMemo(
    () => buildRegisterSearchResults(catalogItems, truckStockItems, query),
    [catalogItems, query, truckStockItems]
  );
  const selectedDraftResult =
    selectedResult !== null && isDraftCoherentForSelectedResult(createDraft, selectedResult)
      ? selectedResult
      : null;
  const shouldShowResults = selectedDraftResult === null;

  function applyCatalogItem(item: FieldCatalogItem) {
    const truckMatch = findTruckMatchForCatalogItem(item, truckStockItems);
    setSelectedResult({ id: `catalog:${item.id}`, kind: 'catalog', item, truckMatch });
    setIsAdvancedOpen(false);
    onUpdateRegisterCreateDraft(job.id, createCatalogRegisterDraftPatch(item, truckStockItems));
  }

  function applyTruckStockItem(item: FieldTruckStockItem) {
    setSelectedResult({ id: `truck:${item.itemId}:${item.locationId}`, kind: 'truckStock', item });
    setIsAdvancedOpen(false);
    onUpdateRegisterCreateDraft(job.id, {
      registerEntryKind: 'part',
      description: item.itemName,
      quantity: '1',
      unitOfMeasure: item.unitOfMeasure ?? 'each',
      unitPrice: '',
      totalAmount: '0',
      partNumber: item.sku ?? '',
      inventoryItemId: item.itemId,
      inventoryLocationId: item.locationId,
      inventorySourceLabel: item.locationName,
      catalogItemId: '',
      catalogSnapshot: undefined
    });
  }

  function applyCustomLine() {
    setSelectedResult({ id: 'custom', kind: 'custom' });
    setIsAdvancedOpen(true);
    onUpdateRegisterCreateDraft(job.id, {
      ...createRegisterEntryDraft({ appointmentId: createDraft.appointmentId || undefined }),
      registerEntryKind: 'other',
      totalAmount: createDraft.totalAmount || '0'
    });
  }

  function applyResult(result: RegisterSearchResult) {
    if (result.kind === 'catalog') {
      applyCatalogItem(result.item);
      return;
    }

    if (result.kind === 'truckStock') {
      applyTruckStockItem(result.item);
      return;
    }

    applyCustomLine();
  }

  function updateCreateDraft(patch: Partial<RegisterEntryDraft>) {
    onUpdateRegisterCreateDraft(job.id, patch);
  }

  function getAddLineGate() {
    addLineGateRef.current ??= createRegisterAddLineGate();
    return addLineGateRef.current;
  }

  async function handleAddLine() {
    return getAddLineGate().run(async () => {
      setIsAdding(true);
      try {
        const didQueue = await onQueueRegisterEntryCreate(job);
        const nextComposerState = resolveRegisterComposerAfterAddAttempt(
          { query, selectedResult, isAdvancedOpen },
          didQueue
        );
        setQuery(nextComposerState.query);
        setSelectedResult(nextComposerState.selectedResult);
        setIsAdvancedOpen(nextComposerState.isAdvancedOpen);
        return didQueue;
      } finally {
        setIsAdding(false);
      }
    });
  }

  return (
    <View style={styles.reviewCard}>
      <Text style={styles.sectionTitleSmall}>Add work</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search Catalog or truck stock"
        style={styles.input}
      />
      {shouldShowResults && query.trim() ? (
        <View style={styles.replacementOptionList}>
          {results.length === 0 ? (
            <Text style={styles.summaryText}>No matching Catalog or truck-stock items.</Text>
          ) : (
            results.map((result) => (
              <Pressable
                key={result.id}
                onPress={() => applyResult(result)}
                style={[
                  styles.replacementOptionButton,
                  selectedResult?.id === result.id ? styles.replacementOptionButtonSelected : null
                ]}
              >
                <Text
                  style={[
                    styles.replacementOptionLabel,
                    selectedResult?.id === result.id ? styles.replacementOptionLabelSelected : null
                  ]}
                >
                  {formatSearchResultTitle(result)}
                </Text>
                <Text
                  style={[
                    styles.summaryText,
                    selectedResult?.id === result.id ? styles.replacementOptionDetailSelected : null
                  ]}
                >
                  {formatSearchResultDetail(result)}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {selectedDraftResult ? (
        <View style={styles.registerComposerCard}>
          <Text style={styles.sectionTitleSmall}>{createDraft.description || 'Custom line'}</Text>
          <Text style={styles.summaryText}>{formatSelectedResultDetail(selectedDraftResult)}</Text>
          {createDraft.catalogSnapshot?.estimatedLaborHours &&
          createDraft.registerEntryKind !== 'labor' ? (
            <Text style={styles.summaryText}>
              Planned time: {createDraft.catalogSnapshot.estimatedLaborHours} hr
            </Text>
          ) : null}
          <TextInput
            value={createDraft.quantity}
            onChangeText={(quantity) =>
              updateCreateDraft(buildPricedRegisterDraftPatch(createDraft, { quantity }))
            }
            keyboardType="decimal-pad"
            placeholder={getQuantityPlaceholder(createDraft)}
            style={styles.input}
          />
          {selectedDraftResult.kind === 'truckStock' && !createDraft.catalogItemId ? (
            <TextInput
              value={createDraft.unitPrice}
              onChangeText={(unitPrice) =>
                updateCreateDraft(buildPricedRegisterDraftPatch(createDraft, { unitPrice }))
              }
              keyboardType="decimal-pad"
              placeholder="Unit price"
              style={styles.input}
            />
          ) : null}
          <View style={styles.registerTotalRow}>
            <Text style={styles.summaryText}>Total</Text>
            <Text style={styles.replacementOptionLabel}>{formatDraftTotalLabel(createDraft)}</Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable
              disabled={isAdding}
              onPress={() => void handleAddLine()}
              style={[styles.primaryButton, isAdding ? styles.disabledButton : null]}
            >
              <Text style={styles.primaryButtonText}>{isAdding ? 'Adding...' : 'Add line'}</Text>
            </Pressable>
            <Pressable
              disabled={isAdding}
              onPress={() => setIsAdvancedOpen((current) => !current)}
              style={[styles.secondaryButton, isAdding ? styles.disabledButton : null]}
            >
              <Text style={styles.secondaryButtonText}>
                {isAdvancedOpen ? 'Hide details' : 'More details'}
              </Text>
            </Pressable>
            <Pressable
              disabled={isAdding}
              onPress={() => setSelectedResult(null)}
              style={[styles.secondaryButton, isAdding ? styles.disabledButton : null]}
            >
              <Text style={styles.secondaryButtonText}>Change item</Text>
            </Pressable>
          </View>
          {isAdvancedOpen ? (
            <RegisterLineAdvancedEditor
              draft={createDraft}
              job={job}
              onChange={updateCreateDraft}
              saveLabel={isAdding ? 'Adding...' : 'Add line'}
              onSave={() => void handleAddLine()}
              saveDisabled={isAdding}
            />
          ) : null}
        </View>
      ) : (
        <Pressable onPress={applyCustomLine} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Add custom line</Text>
        </Pressable>
      )}
    </View>
  );
}

function RegisterLineAdvancedEditor({
  draft,
  job,
  onChange,
  saveLabel,
  onSave,
  onVoid,
  saveDisabled = false,
  showVoid = false
}: {
  draft: RegisterEntryDraft;
  job: FieldJob;
  onChange: (patch: Partial<RegisterEntryDraft>) => void;
  saveLabel: string;
  onSave: () => void;
  saveDisabled?: boolean;
  onVoid?: () => void;
  showVoid?: boolean;
}) {
  function patchPriced(values: Partial<Pick<RegisterEntryDraft, 'quantity' | 'unitPrice'>>) {
    onChange(buildPricedRegisterDraftPatch(draft, values));
  }

  return (
    <View style={styles.registerAdvancedPanel}>
      <View style={styles.actionRow}>
        {registerEntryKinds.map((entryKind) => (
          <Pressable
            key={entryKind}
            onPress={() => onChange({ registerEntryKind: entryKind })}
            style={[
              styles.tagButton,
              draft.registerEntryKind === entryKind ? styles.catalogTagButtonSelected : null
            ]}
          >
            <Text
              style={[
                styles.tagButtonText,
                draft.registerEntryKind === entryKind ? styles.catalogTagButtonTextSelected : null
              ]}
            >
              {formatRegisterEntryKind(entryKind)}
            </Text>
          </Pressable>
        ))}
      </View>
      {job.appointments.length > 0 ? (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => onChange({ appointmentId: '' })}
            style={[
              styles.tagButton,
              !draft.appointmentId ? styles.catalogTagButtonSelected : null
            ]}
          >
            <Text
              style={[
                styles.tagButtonText,
                !draft.appointmentId ? styles.catalogTagButtonTextSelected : null
              ]}
            >
              Job-level
            </Text>
          </Pressable>
          {job.appointments.map((appointment) => (
            <Pressable
              key={appointment.id}
              onPress={() => onChange({ appointmentId: appointment.id })}
              style={[
                styles.tagButton,
                draft.appointmentId === appointment.id ? styles.catalogTagButtonSelected : null
              ]}
            >
              <Text
                style={[
                  styles.tagButtonText,
                  draft.appointmentId === appointment.id
                    ? styles.catalogTagButtonTextSelected
                    : null
                ]}
              >
                {formatAppointmentSchedule(appointment)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput
        value={draft.description}
        onChangeText={(description) => onChange({ description })}
        placeholder="Description"
        style={styles.input}
      />
      <TextInput
        value={draft.quantity}
        onChangeText={(quantity) => patchPriced({ quantity })}
        keyboardType="decimal-pad"
        placeholder={getQuantityPlaceholder(draft)}
        style={styles.input}
      />
      <TextInput
        value={draft.unitOfMeasure}
        onChangeText={(unitOfMeasure) => onChange({ unitOfMeasure })}
        placeholder="Unit"
        style={styles.input}
      />
      <TextInput
        value={draft.unitPrice}
        onChangeText={(unitPrice) => patchPriced({ unitPrice })}
        keyboardType="decimal-pad"
        placeholder="Unit price"
        style={styles.input}
      />
      <TextInput
        value={draft.totalAmount}
        onChangeText={(totalAmount) => onChange({ totalAmount })}
        keyboardType="decimal-pad"
        placeholder="Total"
        style={styles.input}
      />
      <TextInput
        value={draft.partNumber}
        onChangeText={(partNumber) => onChange({ partNumber })}
        placeholder="Part number"
        style={styles.input}
      />
      <TextInput
        value={draft.inventorySourceLabel}
        onChangeText={(inventorySourceLabel) => onChange({ inventorySourceLabel })}
        placeholder="Source"
        style={styles.input}
      />
      <View style={styles.actionRow}>
        <Pressable
          disabled={saveDisabled}
          onPress={onSave}
          style={[styles.secondaryButton, saveDisabled ? styles.disabledButton : null]}
        >
          <Text style={styles.secondaryButtonText}>{saveLabel}</Text>
        </Pressable>
        {showVoid && onVoid ? (
          <Pressable onPress={onVoid} style={styles.dangerButton}>
            <Text style={styles.dangerButtonText}>Void line</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function formatSearchResultTitle(result: RegisterSearchResult): string {
  if (result.kind === 'catalog') {
    return result.item.name;
  }

  if (result.kind === 'truckStock') {
    return result.item.itemName;
  }

  return 'Custom line';
}

function formatSearchResultDetail(result: RegisterSearchResult): string {
  if (result.kind === 'catalog') {
    const parts = [
      formatCatalogKind(result.item.kind),
      result.item.category,
      result.item.code,
      result.item.defaultSalePrice === undefined
        ? 'No price'
        : formatCurrency(result.item.defaultSalePrice),
      result.truckMatch ? `${result.truckMatch.quantityOnHand} on truck` : undefined
    ].filter(Boolean);
    return parts.join(' - ');
  }

  if (result.kind === 'truckStock') {
    return [
      'Truck stock',
      result.item.sku,
      `${result.item.quantityOnHand} on hand`,
      result.item.locationName
    ]
      .filter(Boolean)
      .join(' - ');
  }

  return 'Enter a one-off charge or note for this job.';
}

function formatSelectedResultDetail(result: RegisterSearchResult): string {
  if (result.kind === 'catalog') {
    const description = result.item.description ?? formatCatalogKind(result.item.kind);
    const source = result.truckMatch ? `Truck stock: ${result.truckMatch.locationName}` : undefined;
    return [description, source].filter(Boolean).join(' - ');
  }

  if (result.kind === 'truckStock') {
    return `${result.item.quantityOnHand} on hand - ${result.item.locationName}`;
  }

  return 'Custom line for work that is not in the Catalog yet.';
}

function formatEntrySummary(entry: FieldRegisterEntry): string {
  return [
    formatRegisterEntryKind(entry.kind),
    formatQuantity(entry.quantity, entry.unitOfMeasure),
    entry.catalogSnapshot?.code ?? entry.partNumber
  ]
    .filter(Boolean)
    .join(' - ');
}

function formatQuantity(quantity: number, unitOfMeasure?: string): string {
  return `${quantity}${unitOfMeasure ? ` ${unitOfMeasure}` : ''}`;
}

function getQuantityPlaceholder(draft: RegisterEntryDraft): string {
  return draft.registerEntryKind === 'labor' ? 'Time in hours' : 'Quantity';
}

function formatCatalogKind(kind: FieldCatalogItem['kind']): string {
  if (kind === 'service') return 'Service';
  if (kind === 'part') return 'Part';
  if (kind === 'equipment') return 'Equipment';
  if (kind === 'labor') return 'Labor';
  if (kind === 'fee') return 'Fee';
  if (kind === 'discount') return 'Discount';
  if (kind === 'agreement') return 'Agreement';
  return 'Other';
}
