import { Pressable, Text, TextInput, View } from 'react-native';
import type { RegisterEntryKind } from '@/lib/operations-api';
import { formatAppointmentSchedule } from './field-appointment-display';
import {
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
        onQueueRegisterEntryCreate={onQueueRegisterEntryCreate}
        onUpdateRegisterCreateDraft={onUpdateRegisterCreateDraft}
      />
    </View>
  );
}

function RegisterCreateCard({
  job,
  registerCreateDrafts,
  onQueueRegisterEntryCreate,
  onUpdateRegisterCreateDraft
}: {
  job: FieldJob;
  registerCreateDrafts: Record<string, RegisterEntryDraft>;
  onQueueRegisterEntryCreate: (job: FieldJob) => void;
  onUpdateRegisterCreateDraft: (jobId: string, patch: Partial<RegisterEntryDraft>) => void;
}) {
  const createDraft = registerCreateDrafts[job.id] ?? createRegisterEntryDraft();

  return (
    <View style={styles.reviewCard}>
      <Text style={styles.sectionTitleSmall}>Add register line</Text>
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
