import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { createBellFieldTranslator, type BellFieldLocale } from '@bellfield/i18n';
import type {
  AppointmentStatus,
  FieldCatalogItem,
  FieldTruckStockItem
} from '@/lib/operations-api';
import { AppointmentFinishReviewCard, AppointmentMediaCard } from './field-appointment-work-cards';
import { EquipmentTab } from './field-equipment-tab';
import { FieldJobOverviewSection } from './field-job-overview-section';
import { JobSyncTab } from './field-job-sync-tab';
import {
  formatAppointmentSchedule,
  formatFieldLocationAddress,
  formatFinishedReviewAcknowledgement,
  formatWorkOrderLine,
  summarizeAppointmentQueueState
} from './field-appointment-display';
import {
  buildAppointmentOwnershipWarning,
  formatAppointmentAssignmentLine,
  shouldConfirmAppointmentOwnership
} from './field-assignment-display';
import type { PendingOperation } from './field-sync-types';
import type { FieldMediaSource } from './field-media-capture';
import { RegisterTab } from './field-register-tab';
import {
  createEquipmentCreateDraft,
  createEquipmentDraft,
  createRegisterEntryDraft,
  formatAppointmentStatusLabel,
  type EquipmentCreateDraft,
  type EquipmentDraft,
  type FinishReviewState,
  type RegisterEntryDraft
} from './field-workspace-drafts';
import {
  buildFieldJobCardMetadata,
  buildFieldMediaCaptionDraftKey,
  fieldDetailTabs,
  getAgreementCoverageForJob,
  summarizeJobQueueBadge,
  type FieldDetailTab
} from './field-workspace-layout';
import {
  formatFieldDetailTabLabel,
  formatQueueBadgeLabel,
  QueueBadge
} from './field-job-feed-labels';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';
import type {
  FieldAgreementCoverage,
  FieldAppointment,
  FieldCustomer,
  FieldEquipmentRecord,
  FieldJob,
  FieldLocation,
  FieldRegisterEntry
} from './field-workspace-types';

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

type FieldJobFeedProps = {
  activeDetailTab: FieldDetailTab;
  agreementCoverage: FieldAgreementCoverage[];
  assignedEquipment: FieldEquipmentRecord[];
  catalogItems: FieldCatalogItem[];
  canReplaceRemoveEquipment: boolean;
  currentEmployeeId: string;
  customerLookup: Map<string, FieldCustomer>;
  locale: BellFieldLocale;
  locationLookup: Map<string, FieldLocation>;
  pendingOperations: PendingOperation[];
  scheduledJobs: FieldJob[];
  selectedJobId: string | null;
  syncLastSuccessfulAt: string | null;
  truckStockItems: FieldTruckStockItem[];
  onChangeDetailTab: (tab: FieldDetailTab) => void;
  onConfirmDiscardQueuedOperation: (operation: PendingOperation) => void;
  onConfirmVoidRegisterEntry: (entry: FieldRegisterEntry) => void;
  onCreateEquipmentAtLocation: (
    locationId: string,
    draft: EquipmentCreateDraft
  ) => Promise<boolean>;
  onLinkReplacement: (recordId: string, replacementEquipmentId: string) => Promise<boolean>;
  onOpenJobDetail: (jobId: string) => void;
  onQueueAppointmentStatus: (appointmentId: string, status: AppointmentStatus) => Promise<boolean>;
  onQueueEquipmentUpdate: (record: FieldEquipmentRecord, draft: EquipmentDraft) => Promise<boolean>;
  onQueueJobNote: (jobId: string, note: string) => Promise<boolean>;
  onQueueMediaUpload: (
    job: FieldJob,
    source: FieldMediaSource,
    appointmentId: string | undefined,
    caption: string | undefined
  ) => Promise<boolean>;
  onQueueRegisterEntryCreate: (job: FieldJob, draft: RegisterEntryDraft) => Promise<boolean>;
  onQueueRegisterEntryEdit: (
    entry: FieldRegisterEntry,
    draft: RegisterEntryDraft
  ) => Promise<boolean>;
  onRetryQueuedOperation: (operationId: string) => void;
  onReturnToHome: () => void;
  onCommitFinishReview: (finishReview: FinishReviewState) => Promise<boolean>;
};

export function FieldJobFeed({
  activeDetailTab,
  agreementCoverage,
  assignedEquipment,
  catalogItems,
  canReplaceRemoveEquipment,
  currentEmployeeId,
  customerLookup,
  locale,
  locationLookup,
  pendingOperations,
  scheduledJobs,
  selectedJobId,
  syncLastSuccessfulAt,
  truckStockItems,
  onChangeDetailTab,
  onConfirmDiscardQueuedOperation,
  onConfirmVoidRegisterEntry,
  onCreateEquipmentAtLocation,
  onLinkReplacement,
  onOpenJobDetail,
  onQueueAppointmentStatus,
  onQueueEquipmentUpdate,
  onQueueJobNote,
  onQueueMediaUpload,
  onQueueRegisterEntryCreate,
  onQueueRegisterEntryEdit,
  onRetryQueuedOperation,
  onReturnToHome,
  onCommitFinishReview
}: FieldJobFeedProps) {
  const t = createBellFieldTranslator(locale);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [mediaCaptionDrafts, setMediaCaptionDrafts] = useState<Record<string, string>>({});
  const [registerCreateDrafts, setRegisterCreateDrafts] = useState<
    Record<string, RegisterEntryDraft>
  >({});
  const [registerEditDrafts, setRegisterEditDrafts] = useState<Record<string, RegisterEntryDraft>>(
    {}
  );
  const [equipmentCreateDrafts, setEquipmentCreateDrafts] = useState<
    Record<string, EquipmentCreateDraft>
  >({});
  const [equipmentDrafts, setEquipmentDrafts] = useState<Record<string, EquipmentDraft>>({});
  const [replacementSelections, setReplacementSelections] = useState<Record<string, string>>({});
  const [finishReview, setFinishReview] = useState<FinishReviewState | null>(null);

  function updateRegisterCreateDraft(jobId: string, patch: Partial<RegisterEntryDraft>) {
    setRegisterCreateDrafts((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] ?? createRegisterEntryDraft()),
        ...patch
      }
    }));
  }

  function updateRegisterEditDraft(entry: FieldRegisterEntry, patch: Partial<RegisterEntryDraft>) {
    setRegisterEditDrafts((current) => ({
      ...current,
      [entry.id]: {
        ...(current[entry.id] ?? createRegisterEntryDraft(entry)),
        ...patch
      }
    }));
  }

  function updateEquipmentDraft(record: FieldEquipmentRecord, patch: Partial<EquipmentDraft>) {
    setEquipmentDrafts((current) => ({
      ...current,
      [record.id]: {
        ...(current[record.id] ?? createEquipmentDraft(record)),
        ...patch
      }
    }));
  }

  function updateEquipmentCreateDraft(locationId: string, patch: Partial<EquipmentCreateDraft>) {
    setEquipmentCreateDrafts((current) => ({
      ...current,
      [locationId]: {
        ...(current[locationId] ?? createEquipmentCreateDraft()),
        ...patch
      }
    }));
  }

  async function queueJobNote(jobId: string) {
    const didQueue = await onQueueJobNote(jobId, noteDrafts[jobId] ?? '');

    if (didQueue) {
      setNoteDrafts((current) => ({ ...current, [jobId]: '' }));
    }
  }

  async function queueMediaUpload(job: FieldJob, source: FieldMediaSource, appointmentId?: string) {
    const captionKey = buildFieldMediaCaptionDraftKey({ jobId: job.id, appointmentId });
    const didQueue = await onQueueMediaUpload(
      job,
      source,
      appointmentId,
      mediaCaptionDrafts[captionKey]?.trim() || undefined
    );

    if (didQueue) {
      setMediaCaptionDrafts((current) => ({ ...current, [captionKey]: '' }));
    }
  }

  async function queueRegisterEntryCreate(job: FieldJob): Promise<boolean> {
    const draft = registerCreateDrafts[job.id] ?? createRegisterEntryDraft();
    const didQueue = await onQueueRegisterEntryCreate(job, draft);

    if (didQueue) {
      setRegisterCreateDrafts((current) => ({
        ...current,
        [job.id]: createRegisterEntryDraft({ appointmentId: draft.appointmentId || undefined })
      }));
    }

    return didQueue;
  }

  async function queueRegisterEntryEdit(entry: FieldRegisterEntry) {
    const draft = registerEditDrafts[entry.id] ?? createRegisterEntryDraft(entry);
    const didQueue = await onQueueRegisterEntryEdit(entry, draft);

    if (didQueue) {
      setRegisterEditDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[entry.id];
        return nextDrafts;
      });
    }
  }

  async function queueEquipmentUpdate(record: FieldEquipmentRecord) {
    const draft = equipmentDrafts[record.id] ?? createEquipmentDraft(record);
    const didQueue = await onQueueEquipmentUpdate(record, draft);

    if (didQueue) {
      setEquipmentDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[record.id];
        return nextDrafts;
      });
    }
  }

  async function createEquipmentAtLocation(locationId: string) {
    const draft = equipmentCreateDrafts[locationId] ?? createEquipmentCreateDraft();
    const didCreate = await onCreateEquipmentAtLocation(locationId, draft);

    if (didCreate) {
      setEquipmentCreateDrafts((current) => ({
        ...current,
        [locationId]: createEquipmentCreateDraft()
      }));
    }
  }

  async function linkReplacement(recordId: string) {
    const replacementEquipmentId = replacementSelections[recordId];

    if (!replacementEquipmentId) {
      return;
    }

    const didLink = await onLinkReplacement(recordId, replacementEquipmentId);

    if (didLink) {
      setReplacementSelections((current) => ({ ...current, [recordId]: '' }));
    }
  }

  function beginFinishReview(jobId: string, appointmentId: string) {
    setFinishReview((current) =>
      current?.appointmentId === appointmentId
        ? current
        : {
            jobId,
            appointmentId,
            visitNotes: '',
            finishOutcome: 'completed',
            hasChargeActivity: true,
            registerReminder: ''
          }
    );
  }

  function updateFinishReviewForAppointment(
    appointmentId: string,
    patch: Partial<FinishReviewState>
  ) {
    setFinishReview((current) =>
      current && current.appointmentId === appointmentId ? { ...current, ...patch } : current
    );
  }

  function handleAppointmentStatusPress(
    jobId: string,
    appointment: FieldAppointment,
    status: AppointmentStatus
  ) {
    const continueStatusChange = () => {
      if (status === 'finished') {
        beginFinishReview(jobId, appointment.id);
        return;
      }

      setFinishReview((current) => (current?.appointmentId === appointment.id ? null : current));
      void onQueueAppointmentStatus(appointment.id, status);
    };

    if (shouldConfirmAppointmentOwnership(appointment, currentEmployeeId)) {
      Alert.alert(
        t('fieldAppointment.notAssignedTitle'),
        buildAppointmentOwnershipWarning(
          appointment,
          currentEmployeeId,
          `${t('fieldAppointment.statusActionPrefix')} ${formatAppointmentStatusLabel(status, t)}`,
          t
        ),
        [
          { text: t('fieldWorkspace.actions.cancel'), style: 'cancel' },
          { text: t('fieldWorkspace.actions.continue'), onPress: continueStatusChange }
        ]
      );
      return;
    }

    continueStatusChange();
  }

  function commitFinishReview(allowEmptyNotes: boolean, allowNoNotesAndNoCharges: boolean) {
    const currentFinishReview = finishReview;

    if (!currentFinishReview) {
      return;
    }

    const visitNotes = currentFinishReview.visitNotes.trim();

    if (!visitNotes && !allowEmptyNotes) {
      Alert.alert(
        t('fieldFinishReview.withoutNotesTitle'),
        t('fieldFinishReview.withoutNotesBody'),
        [
          { text: t('fieldFinishReview.addNotes'), style: 'cancel' },
          {
            text: t('fieldWorkspace.actions.continue'),
            onPress: () => commitFinishReview(true, allowNoNotesAndNoCharges)
          }
        ]
      );
      return;
    }

    if (!visitNotes && !currentFinishReview.hasChargeActivity && !allowNoNotesAndNoCharges) {
      Alert.alert(
        t('fieldFinishReview.noNotesNoChargesTitle'),
        t('fieldFinishReview.noNotesNoChargesBody'),
        [
          { text: t('fieldFinishReview.goBack'), style: 'cancel' },
          {
            text: t('fieldWorkspace.actions.continue'),
            onPress: () => commitFinishReview(true, true)
          }
        ]
      );
      return;
    }

    void (async () => {
      const didQueue = await onCommitFinishReview(currentFinishReview);

      if (didQueue) {
        setFinishReview(null);
      }
    })();
  }

  return (
    <>
      {scheduledJobs.map((job) => {
        const location = locationLookup.get(job.locationId);
        const customer = customerLookup.get(job.billToCustomerId);
        const equipment = assignedEquipment.filter(
          (record) => record.locationId === job.locationId
        );
        const jobAgreementCoverage = getAgreementCoverageForJob(job, agreementCoverage);
        const workOrderLine = formatWorkOrderLine(job, t);
        const queueBadge = summarizeJobQueueBadge(job, equipment, pendingOperations);
        const queueBadgeLabel = formatQueueBadgeLabel(queueBadge, t);
        const jobMediaCaptionKey = buildFieldMediaCaptionDraftKey({ jobId: job.id });
        const cardMetadata = buildFieldJobCardMetadata({
          currentEmployeeId,
          job,
          locationAddress: formatFieldLocationAddress(location, t),
          locationName: location?.name ?? job.locationName,
          t
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
                  <Text style={styles.jobCardSummary}>{cardMetadata.summaryLine}</Text>
                  {workOrderLine ? <Text style={styles.summaryText}>{workOrderLine}</Text> : null}
                </View>
                <QueueBadge label={queueBadgeLabel} tone={queueBadge.tone} />
              </View>
              <Text style={styles.jobLocationLine}>{cardMetadata.locationLine}</Text>
              <Text style={styles.pendingText}>{t('fieldWorkspace.openDetails')}</Text>
            </Pressable>
          );
        }

        return (
          <View key={job.id} style={styles.expandedJobCard}>
            <View style={styles.detailHeaderRow}>
              <Pressable onPress={onReturnToHome} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>
                  {t('fieldWorkspace.actions.collapse')}
                </Text>
              </Pressable>
              <QueueBadge label={queueBadgeLabel} tone={queueBadge.tone} />
            </View>
            <Text style={styles.scheduleLabel}>{cardMetadata.scheduleLabel}</Text>
            <Text style={styles.jobCardTitle}>{cardMetadata.title}</Text>
            <Text style={styles.jobCardSummary}>{cardMetadata.summaryLine}</Text>
            {workOrderLine ? <Text style={styles.summaryText}>{workOrderLine}</Text> : null}
            <Text style={styles.jobLocationLine}>{cardMetadata.locationLine}</Text>
            <Text style={styles.summaryText}>
              {t('fieldWorkspace.billTo')}: {job.billToCustomerName}
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
                    {formatFieldDetailTabLabel(tab.id, t)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {activeDetailTab === 'appointments'
              ? job.appointments.map((appointment) => {
                  const assignmentLine = formatAppointmentAssignmentLine(
                    appointment,
                    currentEmployeeId,
                    t
                  );
                  const queueSummary = summarizeAppointmentQueueState(
                    appointment.id,
                    pendingOperations,
                    t
                  );
                  const finishedReviewAcknowledgement = formatFinishedReviewAcknowledgement(
                    appointment,
                    t
                  );
                  const appointmentMediaCaptionKey = buildFieldMediaCaptionDraftKey({
                    jobId: job.id,
                    appointmentId: appointment.id
                  });

                  return (
                    <View key={appointment.id} style={styles.block}>
                      <Text style={styles.sectionTitleSmall}>
                        {formatAppointmentSchedule(appointment, t)}
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
                        {t('fieldOverview.status')}:{' '}
                        {formatAppointmentStatusLabel(appointment.status, t)}
                      </Text>
                      {finishedReviewAcknowledgement ? (
                        <Text style={styles.summaryText}>{finishedReviewAcknowledgement}</Text>
                      ) : null}
                      <View style={styles.actionRow}>
                        {fieldAppointmentStatuses.map((status) => (
                          <Pressable
                            key={status}
                            onPress={() =>
                              handleAppointmentStatusPress(job.id, appointment, status)
                            }
                            style={styles.tagButton}
                          >
                            <Text style={styles.tagButtonText}>
                              {formatAppointmentStatusLabel(status, t)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      {finishReview?.appointmentId === appointment.id ? (
                        <AppointmentFinishReviewCard
                          appointmentId={appointment.id}
                          finishReview={finishReview}
                          onCancel={() => setFinishReview(null)}
                          onSave={() => commitFinishReview(false, false)}
                          onUpdate={updateFinishReviewForAppointment}
                          t={t}
                        />
                      ) : null}

                      <AppointmentMediaCard
                        caption={mediaCaptionDrafts[appointmentMediaCaptionKey] ?? ''}
                        onCaptureMedia={(source) =>
                          void queueMediaUpload(job, source, appointment.id)
                        }
                        onChangeCaption={(value) =>
                          setMediaCaptionDrafts((current) => ({
                            ...current,
                            [appointmentMediaCaptionKey]: value
                          }))
                        }
                        t={t}
                      />
                    </View>
                  );
                })
              : null}

            {activeDetailTab === 'overview' ? (
              <>
                <FieldJobOverviewSection
                  currentEmployeeId={currentEmployeeId}
                  agreementCoverage={jobAgreementCoverage}
                  customer={customer}
                  job={job}
                  locale={locale}
                  location={location}
                />

                <View style={styles.block}>
                  <Text style={styles.sectionTitleSmall}>{t('fieldCapture.title')}</Text>
                  <Text style={styles.summaryText}>{t('fieldCapture.body')}</Text>
                  <TextInput
                    value={noteDrafts[job.id] ?? ''}
                    onChangeText={(value) =>
                      setNoteDrafts((current) => ({ ...current, [job.id]: value }))
                    }
                    multiline
                    placeholder={t('fieldCapture.notePlaceholder')}
                    style={styles.input}
                  />
                  <Pressable
                    onPress={() => void queueJobNote(job.id)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {t('fieldCapture.saveNoteLocally')}
                    </Text>
                  </Pressable>

                  <TextInput
                    value={mediaCaptionDrafts[jobMediaCaptionKey] ?? ''}
                    onChangeText={(value) =>
                      setMediaCaptionDrafts((current) => ({
                        ...current,
                        [jobMediaCaptionKey]: value
                      }))
                    }
                    placeholder={t('fieldCapture.optionalCaption')}
                    style={styles.input}
                  />
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => void queueMediaUpload(job, 'camera')}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {t('fieldCapture.captureMedia')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void queueMediaUpload(job, 'library')}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {t('fieldCapture.pickFromLibrary')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}

            {activeDetailTab === 'register' ? (
              <RegisterTab
                job={job}
                registerCreateDrafts={registerCreateDrafts}
                registerEditDrafts={registerEditDrafts}
                truckStockItems={truckStockItems}
                catalogItems={catalogItems}
                locale={locale}
                onConfirmVoidRegisterEntry={onConfirmVoidRegisterEntry}
                onQueueRegisterEntryCreate={queueRegisterEntryCreate}
                onQueueRegisterEntryEdit={(entry) => void queueRegisterEntryEdit(entry)}
                onUpdateRegisterCreateDraft={updateRegisterCreateDraft}
                onUpdateRegisterEditDraft={updateRegisterEditDraft}
              />
            ) : null}

            {activeDetailTab === 'sync' ? (
              <JobSyncTab
                equipment={equipment}
                job={job}
                pendingOperations={pendingOperations}
                syncLastSuccessfulAt={syncLastSuccessfulAt}
                locale={locale}
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
                onCreateEquipmentAtLocation={(locationId) =>
                  void createEquipmentAtLocation(locationId)
                }
                onLinkReplacement={(recordId) => void linkReplacement(recordId)}
                onQueueEquipmentUpdate={(record) => void queueEquipmentUpdate(record)}
                onSelectReplacement={(recordId, replacementEquipmentId) =>
                  setReplacementSelections((current) => ({
                    ...current,
                    [recordId]: replacementEquipmentId
                  }))
                }
                onUpdateEquipmentCreateDraft={updateEquipmentCreateDraft}
                onUpdateEquipmentDraft={updateEquipmentDraft}
              />
            ) : null}
          </View>
        );
      })}
    </>
  );
}
