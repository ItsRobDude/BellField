import { Pressable, Text, TextInput, View } from 'react-native';
import type { EquipmentStatus } from '@/lib/operations-api';
import {
  createEquipmentCreateDraft,
  createEquipmentDraft,
  type EquipmentCreateDraft,
  type EquipmentDraft
} from './field-workspace-drafts';
import { buildReplacementEquipmentOptions } from './field-workspace-layout';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';
import type { FieldEquipmentRecord, FieldJob } from './field-workspace-types';

type EquipmentTabProps = {
  canReplaceRemoveEquipment: boolean;
  equipment: FieldEquipmentRecord[];
  equipmentCreateDrafts: Record<string, EquipmentCreateDraft>;
  equipmentDrafts: Record<string, EquipmentDraft>;
  job: FieldJob;
  replacementSelections: Record<string, string>;
  onCreateEquipmentAtLocation: (locationId: string) => void;
  onLinkReplacement: (recordId: string) => void;
  onQueueEquipmentUpdate: (record: FieldEquipmentRecord) => void;
  onSelectReplacement: (recordId: string, replacementEquipmentId: string) => void;
  onUpdateEquipmentCreateDraft: (locationId: string, patch: Partial<EquipmentCreateDraft>) => void;
  onUpdateEquipmentDraft: (record: FieldEquipmentRecord, patch: Partial<EquipmentDraft>) => void;
};

export function EquipmentTab({
  canReplaceRemoveEquipment,
  equipment,
  equipmentCreateDrafts,
  equipmentDrafts,
  job,
  replacementSelections,
  onCreateEquipmentAtLocation,
  onLinkReplacement,
  onQueueEquipmentUpdate,
  onSelectReplacement,
  onUpdateEquipmentCreateDraft,
  onUpdateEquipmentDraft
}: EquipmentTabProps) {
  const createDraft = equipmentCreateDrafts[job.locationId] ?? createEquipmentCreateDraft();

  return (
    <>
      {equipment.map((record) => {
        const equipmentDraft = equipmentDrafts[record.id] ?? createEquipmentDraft(record);
        const replacementOptions = buildReplacementEquipmentOptions(record, equipment);
        const selectedReplacementId = replacementSelections[record.id] ?? '';

        return (
          <View key={record.id} style={styles.block}>
            <Text style={styles.sectionTitleSmall}>
              {record.equipmentType}: {record.brand} {record.model}
            </Text>
            <Text style={styles.summaryText}>Serial: {record.serialNumber}</Text>
            <Text style={styles.summaryText}>Age: {record.ageLabel ?? 'Unknown age'}</Text>
            <Text style={styles.summaryText}>
              System group: {record.systemGroup?.name ?? 'Ungrouped'}
            </Text>
            <Text style={styles.summaryText}>Current local equipment status: {record.status}</Text>
            <View style={styles.actionRow}>
              {(
                [
                  'active',
                  'pendingInstall',
                  'inactive',
                  ...(canReplaceRemoveEquipment ? (['removed'] as EquipmentStatus[]) : [])
                ] as EquipmentStatus[]
              ).map((status) => (
                <Pressable
                  key={status}
                  onPress={() => onUpdateEquipmentDraft(record, { status })}
                  style={styles.tagButton}
                >
                  <Text style={styles.tagButtonText}>{status}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={equipmentDraft.model}
              onChangeText={(value) => onUpdateEquipmentDraft(record, { model: value })}
              placeholder="Model"
              style={styles.input}
            />
            <TextInput
              value={equipmentDraft.serialNumber}
              onChangeText={(value) => onUpdateEquipmentDraft(record, { serialNumber: value })}
              placeholder="Serial number"
              style={styles.input}
            />
            <TextInput
              value={equipmentDraft.filterSizes}
              onChangeText={(value) => onUpdateEquipmentDraft(record, { filterSizes: value })}
              placeholder="Filters (comma separated)"
              style={styles.input}
            />
            <TextInput
              value={equipmentDraft.equipmentLocationDescription}
              onChangeText={(value) =>
                onUpdateEquipmentDraft(record, {
                  equipmentLocationDescription: value
                })
              }
              placeholder="Equipment location"
              style={styles.input}
            />
            <TextInput
              value={equipmentDraft.installDate}
              onChangeText={(value) => onUpdateEquipmentDraft(record, { installDate: value })}
              placeholder="Install date (YYYY-MM-DD)"
              style={styles.input}
            />
            {record.warrantyProviderNote ? (
              <Text style={styles.summaryText}>Warranty: {record.warrantyProviderNote}</Text>
            ) : null}
            <TextInput
              value={equipmentDraft.notes}
              onChangeText={(value) => onUpdateEquipmentDraft(record, { notes: value })}
              multiline
              placeholder="Equipment notes"
              style={styles.input}
            />
            <Pressable
              onPress={() => onQueueEquipmentUpdate(record)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Save equipment locally</Text>
            </Pressable>
            {canReplaceRemoveEquipment && replacementOptions.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.sectionTitleSmall}>Link replacement</Text>
                <Text style={styles.summaryText}>
                  Choose the equipment that replaced this unit.
                </Text>
                <View style={styles.replacementOptionList}>
                  {replacementOptions.map((option) => {
                    const isSelected = selectedReplacementId === option.id;

                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => onSelectReplacement(record.id, option.id)}
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
                          {option.label}
                        </Text>
                        <Text
                          style={[
                            styles.summaryText,
                            isSelected ? styles.replacementOptionDetailSelected : null
                          ]}
                        >
                          {option.detail}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  onPress={() => onLinkReplacement(record.id)}
                  disabled={!selectedReplacementId}
                  style={[
                    styles.secondaryButton,
                    !selectedReplacementId ? styles.disabledButton : null
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Link replacement now</Text>
                </Pressable>
              </View>
            ) : null}
            {canReplaceRemoveEquipment && replacementOptions.length === 0 ? (
              <View style={styles.block}>
                <Text style={styles.sectionTitleSmall}>Link replacement</Text>
                <Text style={styles.summaryText}>
                  No eligible replacement equipment is at this location yet. Replacement equipment
                  is usually added when a job PO is received. Use manual add only for equipment
                  found at this location that is not already in BellField.
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.block}>
        <Text style={styles.sectionTitleSmall}>Add discovered equipment</Text>
        <TextInput
          value={createDraft.equipmentType}
          onChangeText={(value) =>
            onUpdateEquipmentCreateDraft(job.locationId, {
              equipmentType: value
            })
          }
          placeholder="Equipment type"
          style={styles.input}
        />
        <TextInput
          value={createDraft.brand}
          onChangeText={(value) => onUpdateEquipmentCreateDraft(job.locationId, { brand: value })}
          placeholder="Brand"
          style={styles.input}
        />
        <TextInput
          value={createDraft.model}
          onChangeText={(value) => onUpdateEquipmentCreateDraft(job.locationId, { model: value })}
          placeholder="Model"
          style={styles.input}
        />
        <TextInput
          value={createDraft.serialNumber}
          onChangeText={(value) =>
            onUpdateEquipmentCreateDraft(job.locationId, {
              serialNumber: value
            })
          }
          placeholder="Serial number"
          style={styles.input}
        />
        <TextInput
          value={createDraft.filterSizes}
          onChangeText={(value) =>
            onUpdateEquipmentCreateDraft(job.locationId, { filterSizes: value })
          }
          placeholder="Filters (comma separated)"
          style={styles.input}
        />
        <TextInput
          value={createDraft.equipmentLocationDescription}
          onChangeText={(value) =>
            onUpdateEquipmentCreateDraft(job.locationId, {
              equipmentLocationDescription: value
            })
          }
          placeholder="Equipment location"
          style={styles.input}
        />
        <TextInput
          value={createDraft.installDate}
          onChangeText={(value) =>
            onUpdateEquipmentCreateDraft(job.locationId, { installDate: value })
          }
          placeholder="Install date (YYYY-MM-DD)"
          style={styles.input}
        />
        <TextInput
          value={createDraft.warrantyStartDate}
          onChangeText={(value) =>
            onUpdateEquipmentCreateDraft(job.locationId, {
              warrantyStartDate: value
            })
          }
          placeholder="Warranty start (YYYY-MM-DD)"
          style={styles.input}
        />
        <TextInput
          value={createDraft.warrantyEndDate}
          onChangeText={(value) =>
            onUpdateEquipmentCreateDraft(job.locationId, {
              warrantyEndDate: value
            })
          }
          placeholder="Warranty end (YYYY-MM-DD)"
          style={styles.input}
        />
        <TextInput
          value={createDraft.warrantyProviderNote}
          onChangeText={(value) =>
            onUpdateEquipmentCreateDraft(job.locationId, {
              warrantyProviderNote: value
            })
          }
          placeholder="Warranty provider or note"
          style={styles.input}
        />
        <TextInput
          value={createDraft.systemGroupName}
          onChangeText={(value) =>
            onUpdateEquipmentCreateDraft(job.locationId, {
              systemGroupName: value
            })
          }
          placeholder="System group name"
          style={styles.input}
        />
        <TextInput
          value={createDraft.notes}
          onChangeText={(value) => onUpdateEquipmentCreateDraft(job.locationId, { notes: value })}
          multiline
          placeholder="Equipment notes"
          style={styles.input}
        />
        <Pressable
          onPress={() => onCreateEquipmentAtLocation(job.locationId)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Create equipment now</Text>
        </Pressable>
      </View>
    </>
  );
}
