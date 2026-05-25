import type { Dispatch, SetStateAction } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type {
  AppointmentFinishOutcome,
  AppointmentStatus,
  EquipmentStatus,
  FieldAssignedWorkResponse,
  RegisterEntryKind
} from '@/lib/operations-api';
import {
  formatAppointmentSchedule,
  formatFieldLocationAddress,
  formatFinishedReviewAcknowledgement,
  formatWorkOrderLine,
  summarizeAppointmentQueueState
} from './field-appointment-display';
import { formatAppointmentAssignmentLine } from './field-assignment-display';
import { formatFinishOutcome, formatPendingOperation } from './field-pending-replay';
import { shouldOfferQueueResolution } from './field-queue-resolution';
import type { PendingOperation } from './field-sync-types';
import type { FieldMediaSource } from './field-media-capture';
import {
  createEquipmentCreateDraft,
  createEquipmentDraft,
  createRegisterEntryDraft,
  formatCurrency,
  formatRegisterEntryKind,
  isLocalRegisterEntry,
  type EquipmentCreateDraft,
  type EquipmentDraft,
  type FinishReviewState,
  type RegisterEntryDraft
} from './field-workspace-drafts';
import {
  buildFieldJobCardMetadata,
  buildFieldMediaCaptionDraftKey,
  buildReplacementEquipmentOptions,
  countJobRegisterEntries,
  fieldDetailTabs,
  getPendingOperationsForJob,
  summarizeJobQueueBadge,
  type FieldDetailTab
} from './field-workspace-layout';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';

type FieldJob = FieldAssignedWorkResponse['jobs'][number];
type FieldEquipmentRecord = FieldAssignedWorkResponse['equipment'][number];
type FieldLocation = FieldAssignedWorkResponse['locations'][number];
type FieldAppointment = FieldJob['appointments'][number];
type FieldRegisterEntry = NonNullable<FieldJob['registerEntries']>[number];

const fieldAppointmentStatuses: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'dispatched',
  'onTheWay',
  'arrived',
  'working',
  'finished',
  'noAnswer'
];

const registerEntryKinds: RegisterEntryKind[] = [
  'labor',
  'serviceItem',
  'part',
  'membership',
  'other'
];

type FieldJobFeedProps = {
  activeDetailTab: FieldDetailTab;
  assignedEquipment: FieldEquipmentRecord[];
  canReplaceRemoveEquipment: boolean;
  currentEmployeeId: string;
  equipmentCreateDrafts: Record<string, EquipmentCreateDraft>;
  equipmentDrafts: Record<string, EquipmentDraft>;
  finishReview: FinishReviewState | null;
  locationLookup: Map<string, FieldLocation>;
  mediaCaptionDrafts: Record<string, string>;
  noteDrafts: Record<string, string>;
  pendingOperations: PendingOperation[];
  registerCreateDrafts: Record<string, RegisterEntryDraft>;
  registerEditDrafts: Record<string, RegisterEntryDraft>;
  replacementSelections: Record<string, string>;
  scheduledJobs: FieldJob[];
  selectedJobId: string | null;
  syncLastSuccessfulAt: string | null;
  onAppointmentStatusPress: (
    jobId: string,
    appointment: FieldAppointment,
    status: AppointmentStatus
  ) => void;
  onChangeDetailTab: (tab: FieldDetailTab) => void;
  onChangeFinishReview: Dispatch<SetStateAction<FinishReviewState | null>>;
  onChangeMediaCaptionDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onChangeNoteDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onConfirmDiscardQueuedOperation: (operation: PendingOperation) => void;
  onConfirmVoidRegisterEntry: (entry: FieldRegisterEntry) => void;
  onCreateEquipmentAtLocation: (locationId: string) => void;
  onLinkReplacement: (recordId: string) => void;
  onOpenJobDetail: (jobId: string) => void;
  onQueueEquipmentUpdate: (record: FieldEquipmentRecord) => void;
  onQueueJobNote: (jobId: string) => void;
  onQueueMediaUpload: (job: FieldJob, source: FieldMediaSource, appointmentId?: string) => void;
  onQueueRegisterEntryCreate: (job: FieldJob) => void;
  onQueueRegisterEntryEdit: (entry: FieldRegisterEntry) => void;
  onRetryQueuedOperation: (operationId: string) => void;
  onReturnToHome: () => void;
  onUpdateEquipmentCreateDraft: (locationId: string, patch: Partial<EquipmentCreateDraft>) => void;
  onUpdateEquipmentDraft: (record: FieldEquipmentRecord, patch: Partial<EquipmentDraft>) => void;
  onUpdateRegisterCreateDraft: (jobId: string, patch: Partial<RegisterEntryDraft>) => void;
  onUpdateRegisterEditDraft: (
    entry: FieldRegisterEntry,
    patch: Partial<RegisterEntryDraft>
  ) => void;
  onCommitFinishReview: (allowEmptyNotes: boolean, allowNoNotesAndNoCharges: boolean) => void;
  onSelectReplacement: (recordId: string, replacementEquipmentId: string) => void;
};

export function FieldJobFeed({
  activeDetailTab,
  assignedEquipment,
  canReplaceRemoveEquipment,
  currentEmployeeId,
  equipmentCreateDrafts,
  equipmentDrafts,
  finishReview,
  locationLookup,
  mediaCaptionDrafts,
  noteDrafts,
  pendingOperations,
  registerCreateDrafts,
  registerEditDrafts,
  replacementSelections,
  scheduledJobs,
  selectedJobId,
  syncLastSuccessfulAt,
  onAppointmentStatusPress,
  onChangeDetailTab,
  onChangeFinishReview,
  onChangeMediaCaptionDrafts,
  onChangeNoteDrafts,
  onConfirmDiscardQueuedOperation,
  onConfirmVoidRegisterEntry,
  onCreateEquipmentAtLocation,
  onLinkReplacement,
  onOpenJobDetail,
  onQueueEquipmentUpdate,
  onQueueJobNote,
  onQueueMediaUpload,
  onQueueRegisterEntryCreate,
  onQueueRegisterEntryEdit,
  onRetryQueuedOperation,
  onReturnToHome,
  onUpdateEquipmentCreateDraft,
  onUpdateEquipmentDraft,
  onUpdateRegisterCreateDraft,
  onUpdateRegisterEditDraft,
  onCommitFinishReview,
  onSelectReplacement
}: FieldJobFeedProps) {
  return (
    <>
      {scheduledJobs.map((job) => {
        const location = locationLookup.get(job.locationId);
        const equipment = assignedEquipment.filter(
          (record) => record.locationId === job.locationId
        );
        const workOrderLine = formatWorkOrderLine(job);
        const queueBadge = summarizeJobQueueBadge(job, equipment, pendingOperations);
        const jobMediaCaptionKey = buildFieldMediaCaptionDraftKey({ jobId: job.id });
        const cardMetadata = buildFieldJobCardMetadata({
          currentEmployeeId,
          equipmentCount: equipment.length,
          job,
          locationAddress: formatFieldLocationAddress(location),
          locationName: location?.name ?? job.locationName,
          registerEntryCount: countJobRegisterEntries(job)
        });
        const isExpanded = selectedJobId === job.id;

        if (!isExpanded) {
          return (
            <Pressable
              key={job.id}
              onPress={() => onOpenJobDetail(job.id)}
              style={styles.jobHomeCard}
            >
              <View style={styles.jobHomeHeader}>
                <View style={styles.flexColumn}>
                  <Text style={styles.scheduleLabel}>{cardMetadata.scheduleLabel}</Text>
                  <Text style={styles.jobCardTitle}>{cardMetadata.title}</Text>
                  {workOrderLine ? <Text style={styles.summaryText}>{workOrderLine}</Text> : null}
                </View>
                <QueueBadge label={queueBadge.label} tone={queueBadge.tone} />
              </View>
              <Text style={styles.summaryText}>{cardMetadata.locationLine}</Text>
              <Text style={styles.summaryText}>{cardMetadata.countsLine}</Text>
              <Text style={styles.pendingText}>Open job detail</Text>
            </Pressable>
          );
        }

        return (
          <View key={job.id} style={styles.expandedJobCard}>
            <View style={styles.detailHeaderRow}>
              <Pressable onPress={onReturnToHome} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Collapse</Text>
              </Pressable>
              <QueueBadge label={queueBadge.label} tone={queueBadge.tone} />
            </View>
            <Text style={styles.scheduleLabel}>{cardMetadata.scheduleLabel}</Text>
            <Text style={styles.jobCardTitle}>{cardMetadata.title}</Text>
            {workOrderLine ? <Text style={styles.summaryText}>{workOrderLine}</Text> : null}
            <Text style={styles.summaryText}>{cardMetadata.locationLine}</Text>
            <Text style={styles.summaryText}>Bill to: {job.billToCustomerName}</Text>
            <Text style={styles.summaryText}>
              Contacts:{' '}
              {location?.contacts.map((contact) => contact.displayName).join(', ') || 'None'}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.segmentedControlScroller}
              contentContainerStyle={styles.segmentedControl}
            >
              {fieldDetailTabs.map((tab) => (
                <Pressable
                  key={tab.id}
                  onPress={() => onChangeDetailTab(tab.id)}
                  style={[
                    styles.segmentButton,
                    activeDetailTab === tab.id ? styles.segmentButtonActive : null
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      activeDetailTab === tab.id ? styles.segmentButtonTextActive : null
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {activeDetailTab === 'appointments'
              ? job.appointments.map((appointment) => {
                  const assignmentLine = formatAppointmentAssignmentLine(
                    appointment,
                    currentEmployeeId
                  );
                  const queueSummary = summarizeAppointmentQueueState(
                    appointment.id,
                    pendingOperations
                  );
                  const finishedReviewAcknowledgement =
                    formatFinishedReviewAcknowledgement(appointment);
                  const appointmentMediaCaptionKey = buildFieldMediaCaptionDraftKey({
                    jobId: job.id,
                    appointmentId: appointment.id
                  });

                  return (
                    <View key={appointment.id} style={styles.block}>
                      <Text style={styles.sectionTitleSmall}>
                        {formatAppointmentSchedule(appointment)}
                      </Text>
                      <Text style={styles.summaryText}>{assignmentLine}</Text>
                      {queueSummary ? (
                        <Text
                          style={
                            queueSummary.tone === 'alert' ? styles.errorText : styles.pendingText
                          }
                        >
                          {queueSummary.label}
                        </Text>
                      ) : null}
                      <Text style={styles.summaryText}>
                        Latest local appointment status: {appointment.status}
                      </Text>
                      {finishedReviewAcknowledgement ? (
                        <Text style={styles.summaryText}>{finishedReviewAcknowledgement}</Text>
                      ) : null}
                      <View style={styles.actionRow}>
                        {fieldAppointmentStatuses.map((status) => (
                          <Pressable
                            key={status}
                            onPress={() => onAppointmentStatusPress(job.id, appointment, status)}
                            style={styles.tagButton}
                          >
                            <Text style={styles.tagButtonText}>{status}</Text>
                          </Pressable>
                        ))}
                      </View>

                      {finishReview?.appointmentId === appointment.id ? (
                        <View style={styles.reviewCard}>
                          <Text style={styles.sectionTitleSmall}>Finish review</Text>
                          <Text style={styles.summaryText}>
                            BellField should prompt for notes, outcome, and charge activity before
                            finishing this visit.
                          </Text>
                          <Text style={styles.summaryText}>
                            Outcome: {formatFinishOutcome(finishReview.finishOutcome)}
                          </Text>
                          <View style={styles.actionRow}>
                            {(
                              [
                                'completed',
                                'followUpNeeded',
                                'noAccess'
                              ] as AppointmentFinishOutcome[]
                            ).map((outcome) => (
                              <Pressable
                                key={outcome}
                                onPress={() =>
                                  onChangeFinishReview((current) =>
                                    current && current.appointmentId === appointment.id
                                      ? { ...current, finishOutcome: outcome }
                                      : current
                                  )
                                }
                                style={styles.tagButton}
                              >
                                <Text style={styles.tagButtonText}>
                                  {formatFinishOutcome(outcome)}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                          <Text style={styles.summaryText}>
                            Charge activity: {finishReview.hasChargeActivity ? 'Yes' : 'No'}
                          </Text>
                          <View style={styles.actionRow}>
                            <Pressable
                              onPress={() =>
                                onChangeFinishReview((current) =>
                                  current && current.appointmentId === appointment.id
                                    ? { ...current, hasChargeActivity: true }
                                    : current
                                )
                              }
                              style={styles.tagButton}
                            >
                              <Text style={styles.tagButtonText}>Charges added</Text>
                            </Pressable>
                            <Pressable
                              onPress={() =>
                                onChangeFinishReview((current) =>
                                  current && current.appointmentId === appointment.id
                                    ? { ...current, hasChargeActivity: false }
                                    : current
                                )
                              }
                              style={styles.tagButton}
                            >
                              <Text style={styles.tagButtonText}>No charges</Text>
                            </Pressable>
                          </View>
                          <TextInput
                            value={finishReview.visitNotes}
                            onChangeText={(value) =>
                              onChangeFinishReview((current) =>
                                current && current.appointmentId === appointment.id
                                  ? { ...current, visitNotes: value }
                                  : current
                              )
                            }
                            multiline
                            placeholder="Visit notes"
                            style={styles.input}
                          />
                          <TextInput
                            value={finishReview.registerReminder}
                            onChangeText={(value) =>
                              onChangeFinishReview((current) =>
                                current && current.appointmentId === appointment.id
                                  ? { ...current, registerReminder: value }
                                  : current
                              )
                            }
                            multiline
                            placeholder="Register item or follow-up reminder"
                            style={styles.input}
                          />
                          <View style={styles.actionRow}>
                            <Pressable
                              onPress={() => onCommitFinishReview(false, false)}
                              style={styles.primaryButton}
                            >
                              <Text style={styles.primaryButtonText}>Save finish locally</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => onChangeFinishReview(null)}
                              style={styles.secondaryButton}
                            >
                              <Text style={styles.secondaryButtonText}>Cancel</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}

                      <View style={styles.reviewCard}>
                        <Text style={styles.sectionTitleSmall}>Appointment media</Text>
                        <TextInput
                          value={mediaCaptionDrafts[appointmentMediaCaptionKey] ?? ''}
                          onChangeText={(value) =>
                            onChangeMediaCaptionDrafts((current) => ({
                              ...current,
                              [appointmentMediaCaptionKey]: value
                            }))
                          }
                          placeholder="Optional caption for this visit"
                          style={styles.input}
                        />
                        <View style={styles.actionRow}>
                          <Pressable
                            onPress={() => onQueueMediaUpload(job, 'camera', appointment.id)}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonText}>Capture media</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => onQueueMediaUpload(job, 'library', appointment.id)}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonText}>Pick from library</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })
              : null}

            {activeDetailTab === 'overview' ? (
              <View style={styles.block}>
                <Text style={styles.sectionTitleSmall}>Save note locally</Text>
                <Text style={styles.summaryText}>
                  This note stays on-device until Sync Now applies it on the server.
                </Text>
                <TextInput
                  value={noteDrafts[job.id] ?? ''}
                  onChangeText={(value) =>
                    onChangeNoteDrafts((current) => ({ ...current, [job.id]: value }))
                  }
                  multiline
                  placeholder="Add visit notes that should queue until sync."
                  style={styles.input}
                />
                <Pressable onPress={() => onQueueJobNote(job.id)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Save note locally</Text>
                </Pressable>

                <View style={styles.reviewCard}>
                  <Text style={styles.sectionTitleSmall}>Media</Text>
                  <Text style={styles.summaryText}>
                    Photos and videos are copied into BellField storage before they enter the sync
                    queue.
                  </Text>
                  <TextInput
                    value={mediaCaptionDrafts[jobMediaCaptionKey] ?? ''}
                    onChangeText={(value) =>
                      onChangeMediaCaptionDrafts((current) => ({
                        ...current,
                        [jobMediaCaptionKey]: value
                      }))
                    }
                    placeholder="Optional caption"
                    style={styles.input}
                  />
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => onQueueMediaUpload(job, 'camera')}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Capture media</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onQueueMediaUpload(job, 'library')}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Pick from library</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            {activeDetailTab === 'register' ? (
              <RegisterTab
                job={job}
                registerCreateDrafts={registerCreateDrafts}
                registerEditDrafts={registerEditDrafts}
                onConfirmVoidRegisterEntry={onConfirmVoidRegisterEntry}
                onQueueRegisterEntryCreate={onQueueRegisterEntryCreate}
                onQueueRegisterEntryEdit={onQueueRegisterEntryEdit}
                onUpdateRegisterCreateDraft={onUpdateRegisterCreateDraft}
                onUpdateRegisterEditDraft={onUpdateRegisterEditDraft}
              />
            ) : null}

            {activeDetailTab === 'sync' ? (
              <JobSyncTab
                equipment={equipment}
                job={job}
                pendingOperations={pendingOperations}
                syncLastSuccessfulAt={syncLastSuccessfulAt}
                onConfirmDiscardQueuedOperation={onConfirmDiscardQueuedOperation}
                onRetryQueuedOperation={onRetryQueuedOperation}
              />
            ) : null}

            {activeDetailTab === 'equipment' ? (
              <EquipmentTab
                canReplaceRemoveEquipment={canReplaceRemoveEquipment}
                equipment={equipment}
                equipmentCreateDrafts={equipmentCreateDrafts}
                equipmentDrafts={equipmentDrafts}
                job={job}
                replacementSelections={replacementSelections}
                onCreateEquipmentAtLocation={onCreateEquipmentAtLocation}
                onLinkReplacement={onLinkReplacement}
                onQueueEquipmentUpdate={onQueueEquipmentUpdate}
                onSelectReplacement={onSelectReplacement}
                onUpdateEquipmentCreateDraft={onUpdateEquipmentCreateDraft}
                onUpdateEquipmentDraft={onUpdateEquipmentDraft}
              />
            ) : null}
          </View>
        );
      })}
    </>
  );
}

function RegisterTab({
  job,
  registerCreateDrafts,
  registerEditDrafts,
  onConfirmVoidRegisterEntry,
  onQueueRegisterEntryCreate,
  onQueueRegisterEntryEdit,
  onUpdateRegisterCreateDraft,
  onUpdateRegisterEditDraft
}: {
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
}) {
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

function JobSyncTab({
  equipment,
  job,
  pendingOperations,
  syncLastSuccessfulAt,
  onConfirmDiscardQueuedOperation,
  onRetryQueuedOperation
}: {
  equipment: FieldEquipmentRecord[];
  job: FieldJob;
  pendingOperations: PendingOperation[];
  syncLastSuccessfulAt: string | null;
  onConfirmDiscardQueuedOperation: (operation: PendingOperation) => void;
  onRetryQueuedOperation: (operationId: string) => void;
}) {
  const jobOperations = getPendingOperationsForJob(job, equipment, pendingOperations);

  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitleSmall}>Queued work for this job</Text>
      {jobOperations.length === 0 ? (
        <Text style={styles.summaryText}>No local changes waiting for this job.</Text>
      ) : (
        jobOperations.map((operation) => (
          <View key={operation.id} style={styles.queueItem}>
            <Text style={styles.summaryText}>{formatPendingOperation(operation)}</Text>
            {shouldOfferQueueResolution(operation) ? (
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => onRetryQueuedOperation(operation.id)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Retry on next sync</Text>
                </Pressable>
                <Pressable
                  onPress={() => onConfirmDiscardQueuedOperation(operation)}
                  style={styles.dangerButton}
                >
                  <Text style={styles.dangerButtonText}>Discard local change</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))
      )}
      <Text style={styles.summaryText}>
        Last successful sync: {syncLastSuccessfulAt ?? 'Not synced yet'}
      </Text>
    </View>
  );
}

function EquipmentTab({
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
}: {
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
}) {
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

function QueueBadge({ label, tone }: { label: string; tone: 'quiet' | 'attention' | 'alert' }) {
  return (
    <Text
      style={[
        styles.queueBadge,
        tone === 'alert'
          ? styles.queueBadgeAlert
          : tone === 'attention'
            ? styles.queueBadgeAttention
            : styles.queueBadgeQuiet
      ]}
    >
      {label}
    </Text>
  );
}
