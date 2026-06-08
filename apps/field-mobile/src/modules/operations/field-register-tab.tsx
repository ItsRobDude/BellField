import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type {
  FieldCatalogItem,
  FieldTruckStockItem,
  RegisterEntryKind
} from '@/lib/operations-api';
import { formatAppointmentSchedule } from './field-appointment-display';
import {
  createCatalogRegisterDraftPatch,
  createRegisterEntryDraft,
  formatCurrency,
  formatRegisterEntryKind,
  isLocalRegisterEntry,
  type RegisterEntryDraft
} from './field-workspace-drafts';
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
  onQueueRegisterEntryCreate: (job: FieldJob) => void;
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
  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitleSmall}>Register entries</Text>
      {(job.registerEntries ?? []).length === 0 ? (
        <Text style={styles.summaryText}>No register lines saved for this job yet.</Text>
      ) : (
        (job.registerEntries ?? []).map((entry) => {
          const editDraft = registerEditDrafts[entry.id] ?? createRegisterEntryDraft(entry);
          const isLocalEntry = isLocalRegisterEntry(entry);

          return (
            <View key={entry.id} style={styles.queueItem}>
              <Text style={styles.summaryText}>
                {formatRegisterEntryKind(entry.kind)} - {entry.description} - {entry.quantity}
                {entry.unitOfMeasure ? ` ${entry.unitOfMeasure}` : ''} -{' '}
                {formatCurrency(entry.totalAmount)}
                {entry.isVoid ? ' - voided' : ''}
              </Text>
              {entry.voidReason ? (
                <Text style={styles.pendingText}>Void reason: {entry.voidReason}</Text>
              ) : null}
              {isLocalEntry ? (
                <Text style={styles.pendingText}>
                  This line is queued locally. Wait for sync or discard it from the pending queue
                  before changing it.
                </Text>
              ) : null}
              {!entry.isVoid && !isLocalEntry ? (
                <>
                  <View style={styles.actionRow}>
                    {registerEntryKinds.map((entryKind) => (
                      <Pressable
                        key={entryKind}
                        onPress={() =>
                          onUpdateRegisterEditDraft(entry, {
                            registerEntryKind: entryKind
                          })
                        }
                        style={styles.tagButton}
                      >
                        <Text style={styles.tagButtonText}>
                          {formatRegisterEntryKind(entryKind)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={editDraft.description}
                    onChangeText={(value) =>
                      onUpdateRegisterEditDraft(entry, { description: value })
                    }
                    placeholder="Description"
                    style={styles.input}
                  />
                  <TextInput
                    value={editDraft.quantity}
                    onChangeText={(value) => onUpdateRegisterEditDraft(entry, { quantity: value })}
                    keyboardType="decimal-pad"
                    placeholder="Quantity"
                    style={styles.input}
                  />
                  <TextInput
                    value={editDraft.unitOfMeasure}
                    onChangeText={(value) =>
                      onUpdateRegisterEditDraft(entry, { unitOfMeasure: value })
                    }
                    placeholder="Unit"
                    style={styles.input}
                  />
                  <TextInput
                    value={editDraft.unitPrice}
                    onChangeText={(value) => onUpdateRegisterEditDraft(entry, { unitPrice: value })}
                    keyboardType="decimal-pad"
                    placeholder="Unit price"
                    style={styles.input}
                  />
                  <TextInput
                    value={editDraft.totalAmount}
                    onChangeText={(value) =>
                      onUpdateRegisterEditDraft(entry, { totalAmount: value })
                    }
                    keyboardType="decimal-pad"
                    placeholder="Total amount"
                    style={styles.input}
                  />
                  <TextInput
                    value={editDraft.partNumber}
                    onChangeText={(value) =>
                      onUpdateRegisterEditDraft(entry, { partNumber: value })
                    }
                    placeholder="Part number"
                    style={styles.input}
                  />
                  <TextInput
                    value={editDraft.inventorySourceLabel}
                    onChangeText={(value) =>
                      onUpdateRegisterEditDraft(entry, {
                        inventorySourceLabel: value
                      })
                    }
                    placeholder="Source label"
                    style={styles.input}
                  />
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => onQueueRegisterEntryEdit(entry)}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Save register edit locally</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onConfirmVoidRegisterEntry(entry)}
                      style={styles.dangerButton}
                    >
                      <Text style={styles.dangerButtonText}>Void line locally</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </View>
          );
        })
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
  onQueueRegisterEntryCreate: (job: FieldJob) => void;
  onUpdateRegisterCreateDraft: (jobId: string, patch: Partial<RegisterEntryDraft>) => void;
}) {
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const createDraft = registerCreateDrafts[job.id] ?? createRegisterEntryDraft();
  const categories = useMemo(
    () => ['All', ...new Set(catalogItems.map((item) => item.category ?? 'Uncategorized'))],
    [catalogItems]
  );
  const visibleCatalogItems = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase();

    return catalogItems.filter((item) => {
      const category = item.category ?? 'Uncategorized';
      const matchesCategory = selectedCategory === 'All' || selectedCategory === category;
      const searchable = [
        item.name,
        item.code ?? '',
        item.category ?? '',
        item.description ?? '',
        ...item.tradeTags
      ]
        .join(' ')
        .toLowerCase();

      return matchesCategory && (!query || searchable.includes(query));
    });
  }, [catalogItems, catalogQuery, selectedCategory]);

  return (
    <View style={styles.reviewCard}>
      <Text style={styles.sectionTitleSmall}>Add register line</Text>
      <Pressable
        onPress={() => setIsCatalogOpen((current) => !current)}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>
          {isCatalogOpen ? 'Hide Catalog' : 'Add from Catalog'}
        </Text>
      </Pressable>
      {isCatalogOpen ? (
        <View style={styles.catalogPicker}>
          <TextInput
            value={catalogQuery}
            onChangeText={setCatalogQuery}
            placeholder="Search Catalog"
            style={styles.input}
          />
          <View style={styles.actionRow}>
            {categories.map((category) => (
              <Pressable
                key={category}
                onPress={() => setSelectedCategory(category)}
                style={[
                  styles.tagButton,
                  selectedCategory === category ? styles.catalogTagButtonSelected : null
                ]}
              >
                <Text
                  style={[
                    styles.tagButtonText,
                    selectedCategory === category ? styles.catalogTagButtonTextSelected : null
                  ]}
                >
                  {category}
                </Text>
              </Pressable>
            ))}
          </View>
          {visibleCatalogItems.length === 0 ? (
            <Text style={styles.summaryText}>No Catalog items match this search.</Text>
          ) : (
            <View style={styles.replacementOptionList}>
              {visibleCatalogItems.slice(0, 20).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    onUpdateRegisterCreateDraft(
                      job.id,
                      createCatalogRegisterDraftPatch(item, truckStockItems)
                    )
                  }
                  style={[
                    styles.replacementOptionButton,
                    createDraft.catalogItemId === item.id
                      ? styles.replacementOptionButtonSelected
                      : null
                  ]}
                >
                  <Text
                    style={[
                      styles.replacementOptionLabel,
                      createDraft.catalogItemId === item.id
                        ? styles.replacementOptionLabelSelected
                        : null
                    ]}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      styles.summaryText,
                      createDraft.catalogItemId === item.id
                        ? styles.replacementOptionDetailSelected
                        : null
                    ]}
                  >
                    {formatCatalogLine(item)}
                  </Text>
                  {item.description ? (
                    <Text
                      style={[
                        styles.summaryText,
                        createDraft.catalogItemId === item.id
                          ? styles.replacementOptionDetailSelected
                          : null
                      ]}
                    >
                      {item.description}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}
      <View style={styles.actionRow}>
        {registerEntryKinds.map((entryKind) => (
          <Pressable
            key={entryKind}
            onPress={() =>
              onUpdateRegisterCreateDraft(job.id, {
                registerEntryKind: entryKind
              })
            }
            style={styles.tagButton}
          >
            <Text style={styles.tagButtonText}>{formatRegisterEntryKind(entryKind)}</Text>
          </Pressable>
        ))}
      </View>
      {job.appointments.length > 0 ? (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => onUpdateRegisterCreateDraft(job.id, { appointmentId: '' })}
            style={styles.tagButton}
          >
            <Text style={styles.tagButtonText}>Job-level</Text>
          </Pressable>
          {job.appointments.map((appointment) => (
            <Pressable
              key={appointment.id}
              onPress={() =>
                onUpdateRegisterCreateDraft(job.id, {
                  appointmentId: appointment.id
                })
              }
              style={styles.tagButton}
            >
              <Text style={styles.tagButtonText}>{formatAppointmentSchedule(appointment)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {createDraft.registerEntryKind === 'part' ? (
        <View style={styles.block}>
          <Text style={styles.sectionTitleSmall}>Truck stock</Text>
          {truckStockItems.length === 0 ? (
            <Text style={styles.summaryText}>
              No truck stock cached. Enter the part details manually - the office will resolve its
              cost.
            </Text>
          ) : (
            <View style={styles.replacementOptionList}>
              {truckStockItems.map((item) => {
                const isSelected =
                  createDraft.inventoryItemId === item.itemId &&
                  createDraft.inventoryLocationId === item.locationId;

                return (
                  <Pressable
                    key={`${item.itemId}:${item.locationId}`}
                    onPress={() =>
                      onUpdateRegisterCreateDraft(job.id, {
                        inventoryItemId: item.itemId,
                        inventoryLocationId: item.locationId,
                        description: item.itemName,
                        partNumber: item.sku ?? '',
                        unitOfMeasure: item.unitOfMeasure ?? createDraft.unitOfMeasure,
                        inventorySourceLabel: item.locationName
                      })
                    }
                    style={[
                      styles.replacementOptionButton,
                      isSelected ? styles.replacementOptionButtonSelected : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.replacementOptionLabel,
                        isSelected ? styles.replacementOptionLabelSelected : null
                      ]}
                    >
                      {item.itemName}
                    </Text>
                    <Text
                      style={[
                        styles.summaryText,
                        isSelected ? styles.replacementOptionDetailSelected : null
                      ]}
                    >
                      {item.quantityOnHand} on hand - {item.locationName}
                    </Text>
                  </Pressable>
                );
              })}
              {createDraft.inventoryItemId ? (
                <Pressable
                  onPress={() =>
                    onUpdateRegisterCreateDraft(job.id, {
                      inventoryItemId: '',
                      inventoryLocationId: ''
                    })
                  }
                  style={styles.tagButton}
                >
                  <Text style={styles.tagButtonText}>Clear truck selection</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
      <TextInput
        value={createDraft.description}
        onChangeText={(value) => onUpdateRegisterCreateDraft(job.id, { description: value })}
        placeholder="Description"
        style={styles.input}
      />
      <TextInput
        value={createDraft.quantity}
        onChangeText={(value) => onUpdateRegisterCreateDraft(job.id, { quantity: value })}
        keyboardType="decimal-pad"
        placeholder="Quantity"
        style={styles.input}
      />
      <TextInput
        value={createDraft.unitOfMeasure}
        onChangeText={(value) => onUpdateRegisterCreateDraft(job.id, { unitOfMeasure: value })}
        placeholder="Unit"
        style={styles.input}
      />
      <TextInput
        value={createDraft.unitPrice}
        onChangeText={(value) => onUpdateRegisterCreateDraft(job.id, { unitPrice: value })}
        keyboardType="decimal-pad"
        placeholder="Unit price"
        style={styles.input}
      />
      <TextInput
        value={createDraft.totalAmount}
        onChangeText={(value) => onUpdateRegisterCreateDraft(job.id, { totalAmount: value })}
        keyboardType="decimal-pad"
        placeholder="Total amount"
        style={styles.input}
      />
      <TextInput
        value={createDraft.partNumber}
        onChangeText={(value) => onUpdateRegisterCreateDraft(job.id, { partNumber: value })}
        placeholder="Part number"
        style={styles.input}
      />
      <TextInput
        value={createDraft.inventorySourceLabel}
        onChangeText={(value) =>
          onUpdateRegisterCreateDraft(job.id, { inventorySourceLabel: value })
        }
        placeholder="Source label"
        style={styles.input}
      />
      <Pressable onPress={() => onQueueRegisterEntryCreate(job)} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Save register line locally</Text>
      </Pressable>
    </View>
  );
}

function formatCatalogLine(item: FieldCatalogItem): string {
  const parts = [
    item.code,
    item.category,
    item.kind,
    item.defaultSalePrice === undefined ? undefined : formatCurrency(item.defaultSalePrice)
  ].filter(Boolean);

  return parts.join(' - ');
}
