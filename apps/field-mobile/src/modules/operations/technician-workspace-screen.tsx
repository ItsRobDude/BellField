import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  ScrollView,
  Text,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addFieldJobNote,
  createFieldEquipment,
  createFieldMediaUploadIntent,
  createFieldRegisterEntry,
  getAssignedFieldWork,
  linkFieldEquipmentReplacement,
  updateFieldAppointmentStatus,
  updateFieldEquipment,
  updateFieldRegisterEntry,
  voidFieldRegisterEntry,
  type AppointmentStatus,
  type FieldAssignedWorkResponse
} from '@/lib/operations-api';
import type { EmployeeSummary } from '@/lib/identity-api';
import {
  initializeFieldSyncStore,
  loadAssignedWorkSnapshot,
  loadPendingOperations,
  loadSyncMetadata,
  queuePendingOperation,
  removePendingOperation,
  saveAssignedWorkSnapshot,
  saveSyncMetadata,
  updatePendingOperationState
} from './field-sync-store';
import type { AssignedWorkSnapshot, PendingOperation, SyncMetadata } from './field-sync-types';
import {
  applyPendingOperations,
  findAppointmentBaseUpdatedAt,
  findEquipmentBaseUpdatedAt,
  findJobBaseUpdatedAt,
  findRegisterEntryBaseUpdatedAt,
  mergeEquipmentMutationIntoAssignedWork,
  mergeJobMutationIntoAssignedWork
} from './field-pending-replay';
import { buildSuccessfulSyncMetadata, summarizeSyncHealth } from './field-sync-status';
import { summarizeOfficeAppointmentChanges } from './field-appointment-display';
import {
  discardPendingOperation as discardPendingOperationFromQueue,
  getReplayablePendingOperations,
  markPendingOperationForRetry
} from './field-queue-resolution';
import {
  nextBackgroundSyncDelayMs,
  shouldRunBackgroundSync
} from './field-background-sync-schedule';
import {
  deleteStagedFieldMedia,
  pickFieldMedia,
  type FieldMediaSource
} from './field-media-capture';
import { buildMediaUploadOperation } from './field-media-files';
import { replayFieldMediaUploadOperation } from './field-media-replay';
import { uploadFieldMediaBlob } from './field-media-upload';
import {
  shouldReturnToFieldHome,
  sortFieldJobsBySchedule,
  type FieldDetailTab
} from './field-workspace-layout';
import { FieldJobFeed } from './field-job-feed';
import {
  FieldNoAssignedJobsCard,
  FieldOfficeChangeNotice,
  FieldSyncSurface,
  FieldUnavailableSurface,
  FieldWorkspaceBottomNav,
  FieldWorkspaceHeader,
  type FieldWorkspaceTab
} from './field-workspace-shell';
import {
  parseRegisterEntryDraft,
  type EquipmentCreateDraft,
  type EquipmentDraft,
  type FinishReviewState,
  type RegisterEntryDraft
} from './field-workspace-drafts';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';

type Props = {
  apiBaseUrl: string;
  employee: EmployeeSummary;
  sessionToken: string;
  onSignOut: () => void;
};

const defaultSyncMetadata: SyncMetadata = {
  lastSuccessfulSyncAt: null,
  lastAttemptedSyncAt: null,
  lastSnapshotVersion: null,
  lastSyncError: null
};

export function TechnicianWorkspaceScreen({
  apiBaseUrl,
  employee,
  sessionToken,
  onSignOut
}: Props) {
  const safeAreaInsets = useSafeAreaInsets();
  const [serverSnapshot, setServerSnapshot] = useState<AssignedWorkSnapshot | null>(null);
  const [pendingOperations, setPendingOperations] = useState<PendingOperation[]>([]);
  const [syncMetadata, setSyncMetadata] = useState<SyncMetadata>(defaultSyncMetadata);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<FieldDetailTab>('overview');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<FieldWorkspaceTab>('jobs');
  const [officeChangeMessages, setOfficeChangeMessages] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Refs for the background sync loop. Refs (not state) so we can read the
  // current values from inside a stable interval callback without making
  // every render reset the timer.
  const isMountedRef = useRef(true);
  const drainInFlightRef = useRef(false);
  const backgroundFailureCountRef = useRef(0);
  const backgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOperationsRef = useRef(pendingOperations);
  const isInitializingRef = useRef(true);

  useEffect(() => {
    pendingOperationsRef.current = pendingOperations;
  }, [pendingOperations]);

  useEffect(() => {
    isInitializingRef.current = isInitializing;
  }, [isInitializing]);

  const assignedWork = useMemo(
    () => applyPendingOperations(serverSnapshot, pendingOperations, employee.displayName),
    [employee.displayName, pendingOperations, serverSnapshot]
  );

  const locationLookup = useMemo(
    () => new Map((assignedWork?.locations ?? []).map((location) => [location.id, location])),
    [assignedWork]
  );

  const syncHealth = useMemo(
    () => summarizeSyncHealth(syncMetadata, pendingOperations),
    [pendingOperations, syncMetadata]
  );
  const assignedJobs = useMemo(() => assignedWork?.jobs ?? [], [assignedWork]);
  const scheduledJobs = useMemo(
    () => sortFieldJobsBySchedule(assignedJobs, employee.id),
    [assignedJobs, employee.id]
  );
  const canReplaceRemoveEquipment = employee.effectivePermissions.includes('equipment:configure');

  // Local navigation state must reset when a sync refresh removes the selected job.
  useEffect(() => {
    if (shouldReturnToFieldHome(scheduledJobs, selectedJobId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedJobId(null);
      setActiveDetailTab('overview');
    }
  }, [scheduledJobs, selectedJobId]);

  useEffect(() => {
    async function initializeWorkspace() {
      setIsInitializing(true);
      setErrorMessage(null);

      try {
        await initializeFieldSyncStore();
        const [persistedSnapshot, persistedOperations, persistedMetadata] = await Promise.all([
          loadAssignedWorkSnapshot(),
          loadPendingOperations(),
          loadSyncMetadata()
        ]);

        setServerSnapshot(persistedSnapshot);
        setPendingOperations(persistedOperations);
        setSyncMetadata(persistedMetadata);
        const nextAssignedWork = await getAssignedFieldWork({ sessionToken, apiBaseUrl });
        const fetchedAt = new Date().toISOString();
        const nextSyncMetadata = buildSuccessfulSyncMetadata(
          persistedMetadata,
          nextAssignedWork.snapshotVersion,
          fetchedAt
        );

        await saveAssignedWorkSnapshot(nextAssignedWork);
        await saveSyncMetadata(nextSyncMetadata);
        setOfficeChangeMessages(
          summarizeOfficeAppointmentChanges(persistedSnapshot, nextAssignedWork)
        );
        setServerSnapshot(nextAssignedWork);
        setSyncMetadata(nextSyncMetadata);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load BellField field storage.'
        );
      } finally {
        setIsInitializing(false);
      }
    }

    void initializeWorkspace();
  }, [apiBaseUrl, sessionToken]);

  async function refreshAssignedWork(showSpinner = true, metadataOverride?: SyncMetadata) {
    if (showSpinner) {
      setIsRefreshing(true);
    }

    setErrorMessage(null);

    try {
      const nextAssignedWork = await getAssignedFieldWork({ sessionToken, apiBaseUrl });
      const fetchedAt = new Date().toISOString();
      const nextSyncMetadata = buildSuccessfulSyncMetadata(
        metadataOverride ?? syncMetadata,
        nextAssignedWork.snapshotVersion,
        fetchedAt
      );

      await saveAssignedWorkSnapshot(nextAssignedWork);
      await saveSyncMetadata(nextSyncMetadata);
      setOfficeChangeMessages(summarizeOfficeAppointmentChanges(serverSnapshot, nextAssignedWork));
      setServerSnapshot(nextAssignedWork);
      setSyncMetadata(nextSyncMetadata);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh assigned work.');
    } finally {
      if (showSpinner) {
        setIsRefreshing(false);
      }
    }
  }

  async function queueJobNote(jobId: string, noteDraft: string): Promise<boolean> {
    const note = noteDraft.trim();

    if (!note) {
      return false;
    }

    const operation: PendingOperation = {
      id: `${jobId}-note-${Date.now()}`,
      kind: 'jobNote',
      jobId,
      note,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt: findJobBaseUpdatedAt(serverSnapshot, jobId),
      state: 'pending'
    };

    try {
      await queuePendingOperation(operation);
      setPendingOperations((current) => [...current, operation]);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the note locally.');
      return false;
    }
  }

  function openJobDetail(jobId: string) {
    setSelectedJobId(jobId);
    setActiveDetailTab('overview');
    setActiveWorkspaceTab('jobs');
  }

  function returnToHome() {
    setSelectedJobId(null);
    setActiveDetailTab('overview');
  }

  async function queueMediaUpload(
    job: FieldAssignedWorkResponse['jobs'][number],
    source: FieldMediaSource,
    appointmentId: string | undefined,
    captionDraft: string | undefined
  ): Promise<boolean> {
    setErrorMessage(null);

    try {
      const stagedMedia = await pickFieldMedia(source);

      if (!stagedMedia) {
        return false;
      }

      const caption = captionDraft?.trim();
      const operation = buildMediaUploadOperation({
        jobId: job.id,
        appointmentId,
        stagedMedia,
        caption,
        baseUpdatedAt: findJobBaseUpdatedAt(serverSnapshot, job.id)
      });

      await queuePendingOperation(operation);
      setPendingOperations((current) => [...current, operation]);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to queue media locally.');
      return false;
    }
  }

  async function queueRegisterEntryCreate(
    job: FieldAssignedWorkResponse['jobs'][number],
    draft: RegisterEntryDraft
  ): Promise<boolean> {
    const parsed = parseRegisterEntryDraft(draft, false);

    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return false;
    }

    const operation: PendingOperation = {
      id: `${job.id}-register-${Date.now()}`,
      kind: 'registerEntryCreate',
      jobId: job.id,
      appointmentId: draft.appointmentId || undefined,
      registerEntryKind: draft.registerEntryKind,
      description: parsed.value.description,
      quantity: parsed.value.quantity,
      unitOfMeasure: parsed.value.unitOfMeasure,
      unitPrice: parsed.value.unitPrice ?? undefined,
      totalAmount: parsed.value.totalAmount,
      partNumber: parsed.value.partNumber,
      inventorySourceLabel: parsed.value.inventorySourceLabel,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt: findJobBaseUpdatedAt(serverSnapshot, job.id),
      state: 'pending'
    };

    try {
      await queuePendingOperation(operation);
      setPendingOperations((current) => [...current, operation]);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the register entry locally.'
      );
      return false;
    }
  }

  async function queueRegisterEntryEdit(
    entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number],
    draft: RegisterEntryDraft
  ): Promise<boolean> {
    const parsed = parseRegisterEntryDraft(draft, true);

    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return false;
    }

    const operation: PendingOperation = {
      id: `${entry.id}-register-edit-${Date.now()}`,
      kind: 'registerEntryEdit',
      jobId: entry.jobId,
      registerEntryId: entry.id,
      appointmentId: draft.appointmentId || null,
      registerEntryKind: draft.registerEntryKind,
      description: parsed.value.description,
      quantity: parsed.value.quantity,
      unitOfMeasure: parsed.value.unitOfMeasure,
      unitPrice: parsed.value.unitPrice,
      totalAmount: parsed.value.totalAmount,
      partNumber: parsed.value.partNumber,
      inventorySourceLabel: parsed.value.inventorySourceLabel,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt: findRegisterEntryBaseUpdatedAt(serverSnapshot, entry.id),
      state: 'pending'
    };

    try {
      await queuePendingOperation(operation);
      setPendingOperations((current) => [
        ...current.filter(
          (pendingOperation) =>
            !(
              (pendingOperation.kind === 'registerEntryEdit' ||
                pendingOperation.kind === 'registerEntryVoid') &&
              pendingOperation.registerEntryId === entry.id
            )
        ),
        operation
      ]);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the register edit locally.'
      );
      return false;
    }
  }

  function confirmVoidRegisterEntry(
    entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number]
  ) {
    Alert.alert(
      'Void register entry?',
      'This keeps the line in job history and queues a void for office sync.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void locally',
          style: 'destructive',
          onPress: () => {
            void queueRegisterEntryVoid(entry);
          }
        }
      ]
    );
  }

  async function queueRegisterEntryVoid(
    entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number]
  ) {
    const operation: PendingOperation = {
      id: `${entry.id}-register-void-${Date.now()}`,
      kind: 'registerEntryVoid',
      jobId: entry.jobId,
      registerEntryId: entry.id,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt: findRegisterEntryBaseUpdatedAt(serverSnapshot, entry.id),
      state: 'pending'
    };

    try {
      await queuePendingOperation(operation);
      setPendingOperations((current) => [
        ...current.filter(
          (pendingOperation) =>
            !(
              (pendingOperation.kind === 'registerEntryEdit' ||
                pendingOperation.kind === 'registerEntryVoid') &&
              pendingOperation.registerEntryId === entry.id
            )
        ),
        operation
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to void the register entry locally.'
      );
    }
  }

  async function queueAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus
  ): Promise<boolean> {
    const baseUpdatedAt = findAppointmentBaseUpdatedAt(serverSnapshot, appointmentId);
    const nextOperation: PendingOperation = {
      id: `${appointmentId}-status-${Date.now()}`,
      kind: 'appointmentStatus',
      appointmentId,
      status,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt,
      state: 'pending'
    };

    try {
      await queuePendingOperation(nextOperation);
      setPendingOperations((current) => [
        ...current.filter(
          (operation) =>
            !(
              (operation.kind === 'appointmentStatus' ||
                operation.kind === 'appointmentFinishReview') &&
              operation.appointmentId === appointmentId
            )
        ),
        nextOperation
      ]);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the appointment status locally.'
      );
      return false;
    }
  }

  async function queueAppointmentFinishReview(
    currentFinishReview: FinishReviewState
  ): Promise<boolean> {
    const baseUpdatedAt = findAppointmentBaseUpdatedAt(
      serverSnapshot,
      currentFinishReview.appointmentId
    );
    const nextOperation: PendingOperation = {
      id: `${currentFinishReview.appointmentId}-finish-${Date.now()}`,
      kind: 'appointmentFinishReview',
      appointmentId: currentFinishReview.appointmentId,
      status: 'finished',
      finishOutcome: currentFinishReview.finishOutcome,
      visitNotes: currentFinishReview.visitNotes.trim() || undefined,
      hasChargeActivity: currentFinishReview.hasChargeActivity,
      registerFollowUpNote: currentFinishReview.registerReminder.trim() || undefined,
      occurredAt: new Date().toISOString(),
      baseUpdatedAt,
      state: 'pending'
    };

    try {
      await queuePendingOperation(nextOperation);
      setPendingOperations((current) => [
        ...current.filter(
          (operation) =>
            !(
              (operation.kind === 'appointmentStatus' ||
                operation.kind === 'appointmentFinishReview') &&
              operation.appointmentId === currentFinishReview.appointmentId
            )
        ),
        nextOperation
      ]);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the finish review locally.'
      );
      return false;
    }
  }

  async function queueEquipmentUpdate(
    record: FieldAssignedWorkResponse['equipment'][number],
    draft: EquipmentDraft
  ): Promise<boolean> {
    const nextOperation: PendingOperation = {
      id: `${record.id}-equipment-${Date.now()}`,
      kind: 'equipmentUpdate',
      equipmentId: record.id,
      model: draft.model.trim(),
      serialNumber: draft.serialNumber.trim(),
      filterSizes: draft.filterSizes
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      equipmentLocationDescription: draft.equipmentLocationDescription.trim() || undefined,
      installDate: draft.installDate.trim() || undefined,
      status: draft.status,
      notes: draft.notes.trim(),
      occurredAt: new Date().toISOString(),
      baseUpdatedAt: findEquipmentBaseUpdatedAt(serverSnapshot, record.id),
      state: 'pending'
    };

    try {
      await queuePendingOperation(nextOperation);
      setPendingOperations((current) => [
        ...current.filter(
          (operation) =>
            !(operation.kind === 'equipmentUpdate' && operation.equipmentId === record.id)
        ),
        nextOperation
      ]);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the equipment change locally.'
      );
      return false;
    }
  }

  async function createEquipmentAtLocation(
    locationId: string,
    draft: EquipmentCreateDraft
  ): Promise<boolean> {
    try {
      await createFieldEquipment({
        sessionToken,
        apiBaseUrl,
        locationId,
        equipmentType: draft.equipmentType,
        brand: draft.brand,
        model: draft.model,
        serialNumber: draft.serialNumber,
        filterSizes: draft.filterSizes
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
        equipmentLocationDescription: draft.equipmentLocationDescription || undefined,
        installDate: draft.installDate || undefined,
        warrantyStartDate: draft.warrantyStartDate || undefined,
        warrantyEndDate: draft.warrantyEndDate || undefined,
        warrantyProviderNote: draft.warrantyProviderNote || undefined,
        systemGroupName: draft.systemGroupName || undefined,
        status: draft.status,
        notes: draft.notes || undefined
      });
      await refreshAssignedWork(false);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Serial number is strongly recommended')
      ) {
        Alert.alert(
          'Create without serial?',
          'Serial number is blank. Create this equipment record anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Create',
              onPress: () => {
                void createFieldEquipment({
                  sessionToken,
                  apiBaseUrl,
                  locationId,
                  equipmentType: draft.equipmentType,
                  brand: draft.brand,
                  model: draft.model,
                  serialNumber: draft.serialNumber,
                  filterSizes: draft.filterSizes
                    .split(',')
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0),
                  equipmentLocationDescription: draft.equipmentLocationDescription || undefined,
                  installDate: draft.installDate || undefined,
                  warrantyStartDate: draft.warrantyStartDate || undefined,
                  warrantyEndDate: draft.warrantyEndDate || undefined,
                  warrantyProviderNote: draft.warrantyProviderNote || undefined,
                  systemGroupName: draft.systemGroupName || undefined,
                  status: draft.status,
                  notes: draft.notes || undefined,
                  confirmMissingSerial: true
                })
                  .then(() => refreshAssignedWork(false))
                  .catch((createError) => {
                    setErrorMessage(
                      createError instanceof Error
                        ? createError.message
                        : 'Unable to create equipment.'
                    );
                  });
              }
            }
          ]
        );
        return false;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Unable to create equipment.');
      return false;
    }
  }

  async function linkReplacement(
    recordId: string,
    replacementEquipmentId: string
  ): Promise<boolean> {
    try {
      await linkFieldEquipmentReplacement({
        equipmentId: recordId,
        replacementEquipmentId,
        sessionToken,
        apiBaseUrl
      });
      await refreshAssignedWork(false);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to link replacement equipment.'
      );
      return false;
    }
  }

  async function retryQueuedOperation(operationId: string) {
    setErrorMessage(null);

    try {
      await updatePendingOperationState(operationId, 'pending');
      setPendingOperations((current) => markPendingOperationForRetry(current, operationId));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to mark the local change for retry.'
      );
    }
  }

  function confirmDiscardQueuedOperation(operation: PendingOperation) {
    Alert.alert(
      'Discard local change?',
      'This removes the saved local change from this device and it will not sync to the office.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            void discardQueuedOperation(operation.id);
          }
        }
      ]
    );
  }

  async function discardQueuedOperation(operationId: string) {
    setErrorMessage(null);

    try {
      await removePendingOperation(operationId);
      setPendingOperations((current) => discardPendingOperationFromQueue(current, operationId));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to discard the local change.'
      );
    }
  }

  // Internal drain orchestration. Called by both the manual Sync Now button
  // and the background sync loop. Returns whether the drain finished cleanly
  // so the background loop can update its backoff state.
  //
  // The caller is responsible for the mutex (drainInFlightRef) and any
  // visible spinner state. This function only touches the data path.
  async function runSyncDrain(options: { visible: boolean }): Promise<{ ok: boolean }> {
    if (options.visible) {
      setErrorMessage(null);
    }

    const attemptedAt = new Date().toISOString();
    const attemptedMetadata: SyncMetadata = {
      ...syncMetadata,
      lastAttemptedSyncAt: attemptedAt,
      lastSyncError: null
    };

    await saveSyncMetadata(attemptedMetadata);
    setSyncMetadata(attemptedMetadata);

    try {
      const latestSnapshot = await getAssignedFieldWork({ sessionToken, apiBaseUrl });
      await saveAssignedWorkSnapshot(latestSnapshot);
      setServerSnapshot(latestSnapshot);

      let currentServerSnapshot: AssignedWorkSnapshot = latestSnapshot;
      let shouldStopEarly = false;
      let hadSyncFailure = false;

      async function preserveAppliedOperation(
        operationId: string,
        nextSnapshot: AssignedWorkSnapshot
      ) {
        currentServerSnapshot = nextSnapshot;
        await saveAssignedWorkSnapshot(currentServerSnapshot);
        setServerSnapshot(currentServerSnapshot);
        await removePendingOperation(operationId);
        setPendingOperations((current) => current.filter((entry) => entry.id !== operationId));
      }

      for (const operation of getReplayablePendingOperations(pendingOperations)) {
        if (shouldStopEarly) {
          break;
        }

        try {
          if (operation.kind === 'jobNote') {
            const response = await addFieldJobNote({
              sessionToken,
              apiBaseUrl,
              jobId: operation.jobId,
              note: operation.note,
              occurredAt: operation.occurredAt,
              baseUpdatedAt: operation.baseUpdatedAt
            });

            if (response.syncResult?.status === 'conflict') {
              await updatePendingOperationState(
                operation.id,
                'conflict',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'conflict',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(
                operation.id,
                'rejected',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'rejected',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else {
              await preserveAppliedOperation(
                operation.id,
                mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
              );
            }
          }

          if (operation.kind === 'appointmentStatus') {
            const response = await updateFieldAppointmentStatus({
              sessionToken,
              apiBaseUrl,
              appointmentId: operation.appointmentId,
              status: operation.status,
              occurredAt: operation.occurredAt,
              baseUpdatedAt: operation.baseUpdatedAt
            });

            if (response.syncResult?.status === 'conflict') {
              await updatePendingOperationState(
                operation.id,
                'conflict',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'conflict',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(
                operation.id,
                'rejected',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'rejected',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else {
              await preserveAppliedOperation(
                operation.id,
                mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
              );
            }
          }

          if (operation.kind === 'appointmentFinishReview') {
            const response = await updateFieldAppointmentStatus({
              sessionToken,
              apiBaseUrl,
              appointmentId: operation.appointmentId,
              status: operation.status,
              finishOutcome: operation.finishOutcome,
              visitNotes: operation.visitNotes,
              hasChargeActivity: operation.hasChargeActivity,
              registerFollowUpNote: operation.registerFollowUpNote,
              occurredAt: operation.occurredAt,
              baseUpdatedAt: operation.baseUpdatedAt
            });

            if (response.syncResult?.status === 'conflict') {
              await updatePendingOperationState(
                operation.id,
                'conflict',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'conflict',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(
                operation.id,
                'rejected',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'rejected',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else {
              await preserveAppliedOperation(
                operation.id,
                mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
              );
            }
          }

          if (operation.kind === 'registerEntryCreate') {
            const response = await createFieldRegisterEntry({
              sessionToken,
              apiBaseUrl,
              jobId: operation.jobId,
              appointmentId: operation.appointmentId,
              kind: operation.registerEntryKind,
              description: operation.description,
              quantity: operation.quantity,
              unitOfMeasure: operation.unitOfMeasure,
              unitPrice: operation.unitPrice,
              totalAmount: operation.totalAmount,
              partNumber: operation.partNumber,
              inventorySourceLabel: operation.inventorySourceLabel,
              occurredAt: operation.occurredAt,
              baseUpdatedAt: operation.baseUpdatedAt
            });

            if (response.syncResult?.status === 'conflict') {
              await updatePendingOperationState(
                operation.id,
                'conflict',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'conflict',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(
                operation.id,
                'rejected',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'rejected',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else {
              await preserveAppliedOperation(
                operation.id,
                mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
              );
            }
          }

          if (operation.kind === 'registerEntryEdit') {
            const response = await updateFieldRegisterEntry({
              sessionToken,
              apiBaseUrl,
              registerEntryId: operation.registerEntryId,
              appointmentId: operation.appointmentId,
              kind: operation.registerEntryKind,
              description: operation.description,
              quantity: operation.quantity,
              unitOfMeasure: operation.unitOfMeasure,
              unitPrice: operation.unitPrice,
              totalAmount: operation.totalAmount,
              partNumber: operation.partNumber,
              inventorySourceLabel: operation.inventorySourceLabel,
              occurredAt: operation.occurredAt,
              baseUpdatedAt: operation.baseUpdatedAt
            });

            if (response.syncResult?.status === 'conflict') {
              await updatePendingOperationState(
                operation.id,
                'conflict',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'conflict',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(
                operation.id,
                'rejected',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'rejected',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else {
              await preserveAppliedOperation(
                operation.id,
                mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
              );
            }
          }

          if (operation.kind === 'registerEntryVoid') {
            const response = await voidFieldRegisterEntry({
              sessionToken,
              apiBaseUrl,
              registerEntryId: operation.registerEntryId,
              reason: operation.reason,
              occurredAt: operation.occurredAt,
              baseUpdatedAt: operation.baseUpdatedAt
            });

            if (response.syncResult?.status === 'conflict') {
              await updatePendingOperationState(
                operation.id,
                'conflict',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'conflict',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(
                operation.id,
                'rejected',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'rejected',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else {
              await preserveAppliedOperation(
                operation.id,
                mergeJobMutationIntoAssignedWork(currentServerSnapshot, response)
              );
            }
          }

          if (operation.kind === 'mediaUpload') {
            const response = await replayFieldMediaUploadOperation(operation, {
              createUploadIntent: (mediaOperation) =>
                createFieldMediaUploadIntent({
                  sessionToken,
                  apiBaseUrl,
                  jobId: mediaOperation.jobId,
                  appointmentId: mediaOperation.appointmentId,
                  kind: mediaOperation.mediaKind,
                  contentType: mediaOperation.contentType,
                  byteSize: mediaOperation.byteSize,
                  sha256: mediaOperation.sha256,
                  originalFilename: mediaOperation.originalFilename,
                  caption: mediaOperation.caption,
                  capturedAt: mediaOperation.capturedAt
                }),
              uploadBlob: ({ mediaId, uploadToken, localUri }) =>
                uploadFieldMediaBlob({
                  apiBaseUrl,
                  mediaId,
                  uploadToken,
                  localUri
                })
            });

            if (response.status === 'rejected') {
              await updatePendingOperationState(operation.id, 'rejected', response.message);
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? { ...entry, state: 'rejected', lastResultMessage: response.message }
                    : entry
                )
              );
              continue;
            }

            await preserveAppliedOperation(operation.id, currentServerSnapshot);
            await deleteStagedFieldMedia(operation.localUri).catch(() => undefined);
          }

          if (operation.kind === 'equipmentUpdate') {
            const response = await updateFieldEquipment({
              sessionToken,
              apiBaseUrl,
              equipmentId: operation.equipmentId,
              model: operation.model,
              serialNumber: operation.serialNumber,
              filterSizes: operation.filterSizes,
              equipmentLocationDescription: operation.equipmentLocationDescription,
              installDate: operation.installDate,
              status: operation.status,
              notes: operation.notes,
              occurredAt: operation.occurredAt,
              baseUpdatedAt: operation.baseUpdatedAt
            });

            if (response.syncResult?.status === 'conflict') {
              await updatePendingOperationState(
                operation.id,
                'conflict',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'conflict',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(
                operation.id,
                'rejected',
                response.syncResult.message
              );
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? {
                        ...entry,
                        state: 'rejected',
                        lastResultMessage: response.syncResult?.message
                      }
                    : entry
                )
              );
            } else {
              await preserveAppliedOperation(
                operation.id,
                mergeEquipmentMutationIntoAssignedWork(currentServerSnapshot, response)
              );
            }
          }
        } catch (error) {
          const nextErrorMessage =
            error instanceof Error ? error.message : 'Unable to sync queued field work.';
          const failedMetadata: SyncMetadata = {
            ...attemptedMetadata,
            lastSyncError: nextErrorMessage
          };

          await saveSyncMetadata(failedMetadata);
          setSyncMetadata(failedMetadata);
          setErrorMessage(nextErrorMessage);
          hadSyncFailure = true;
          shouldStopEarly = true;
        }
      }

      if (hadSyncFailure) {
        return { ok: false };
      }

      const refreshedSnapshot = await getAssignedFieldWork({ sessionToken, apiBaseUrl });
      const nextSyncMetadata = buildSuccessfulSyncMetadata(
        attemptedMetadata,
        refreshedSnapshot.snapshotVersion,
        new Date().toISOString(),
        attemptedAt
      );

      await saveAssignedWorkSnapshot(refreshedSnapshot);
      await saveSyncMetadata(nextSyncMetadata);
      setServerSnapshot(refreshedSnapshot);
      setSyncMetadata(nextSyncMetadata);
      return { ok: true };
    } catch (error) {
      const nextErrorMessage =
        error instanceof Error ? error.message : 'Unable to sync queued field work.';
      const failedMetadata: SyncMetadata = {
        ...attemptedMetadata,
        lastSyncError: nextErrorMessage
      };

      await saveSyncMetadata(failedMetadata);
      setSyncMetadata(failedMetadata);
      // Surface a visible error message only when the drain was user-initiated.
      // Background failures stay quiet; the sync indicator card already
      // flips to alert tone via lastSyncError so the technician can see it.
      if (options.visible) {
        setErrorMessage(nextErrorMessage);
      }
      return { ok: false };
    }
  }

  async function syncNow() {
    if (drainInFlightRef.current) {
      // A background drain is already running; a second one would race
      // against it. Manual presses during a background drain just yield.
      return;
    }

    drainInFlightRef.current = true;
    setIsSyncing(true);
    try {
      const result = await runSyncDrain({ visible: true });
      if (result.ok) {
        // A successful manual drain also resets the background backoff so
        // the next scheduled background attempt fires at the base interval.
        backgroundFailureCountRef.current = 0;
      }
    } finally {
      drainInFlightRef.current = false;
      setIsSyncing(false);
    }
  }

  async function runBackgroundSyncAttempt() {
    if (!isMountedRef.current) {
      return;
    }

    const gateState = {
      isDrainInFlight: drainInFlightRef.current,
      isInitializing: isInitializingRef.current,
      replayableOperationCount: getReplayablePendingOperations(pendingOperationsRef.current).length,
      isWorkspaceMounted: isMountedRef.current
    };

    if (!shouldRunBackgroundSync(gateState)) {
      return;
    }

    drainInFlightRef.current = true;
    setIsSyncing(true);
    try {
      const result = await runSyncDrain({ visible: false });
      if (!isMountedRef.current) {
        return;
      }

      if (result.ok) {
        backgroundFailureCountRef.current = 0;
      } else {
        backgroundFailureCountRef.current = Math.min(backgroundFailureCountRef.current + 1, 10);
      }
    } finally {
      drainInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsSyncing(false);
      }
    }
  }

  // Hold the latest runBackgroundSyncAttempt in a ref so the mount-only
  // background timer effect can always call the freshest closure without
  // re-creating the timer on every render.
  const runBackgroundSyncAttemptRef = useRef<() => Promise<void>>(runBackgroundSyncAttempt);
  useEffect(() => {
    runBackgroundSyncAttemptRef.current = runBackgroundSyncAttempt;
  });

  // Background sync loop: drains the pending queue quietly while the
  // technician workspace is mounted. Only `pending` operations are
  // retried; `conflict` and `rejected` stay preserved until the
  // technician explicitly retries or discards them via the queue
  // resolution UI. Manual Sync Now and background sync are gated by the
  // shared drainInFlightRef so they cannot overlap.
  useEffect(() => {
    isMountedRef.current = true;

    async function attempt() {
      await runBackgroundSyncAttemptRef.current();
    }

    function scheduleNextAttempt() {
      if (!isMountedRef.current) {
        return;
      }

      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
      }

      const delayMs = nextBackgroundSyncDelayMs(backgroundFailureCountRef.current);
      backgroundTimerRef.current = setTimeout(() => {
        void (async () => {
          await attempt();
          if (isMountedRef.current) {
            scheduleNextAttempt();
          }
        })();
      }, delayMs);
    }

    function handleAppStateChange(nextAppState: AppStateStatus) {
      // When the OS brings the app back to the foreground while the
      // technician workspace is mounted, attempt a drain right away so
      // the technician sees fresh data and queued work flushes without
      // waiting on the next timer tick.
      if (nextAppState === 'active') {
        void (async () => {
          await attempt();
          if (isMountedRef.current) {
            scheduleNextAttempt();
          }
        })();
      }
    }

    scheduleNextAttempt();
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      isMountedRef.current = false;
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }
      subscription.remove();
    };
  }, []);

  function handleSignOut() {
    if (pendingOperations.length === 0) {
      onSignOut();
      return;
    }

    Alert.alert(
      'Unsynced work',
      'This device still has BellField field changes stored locally that have not fully synced. Sign out anyway?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: onSignOut }
      ]
    );
  }

  if (isInitializing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingState}>
          <ActivityIndicator color="#1c6b57" />
          <Text style={styles.summaryText}>Preparing BellField field storage...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 108 + safeAreaInsets.bottom }
        ]}
      >
        <View style={styles.card}>
          <FieldWorkspaceHeader
            assignedWork={assignedWork}
            employee={employee}
            isRefreshing={isRefreshing}
            isSyncing={isSyncing}
            onRefresh={() => void refreshAssignedWork()}
            onSignOut={handleSignOut}
            onSyncNow={() => void syncNow()}
            showSyncSummary={activeWorkspaceTab !== 'sync'}
            syncHealth={syncHealth}
            syncMetadata={syncMetadata}
          />

          <FieldOfficeChangeNotice messages={officeChangeMessages} />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {activeWorkspaceTab === 'jobs' && scheduledJobs.length === 0 ? (
            <FieldNoAssignedJobsCard />
          ) : null}

          {activeWorkspaceTab === 'jobs' ? (
            <FieldJobFeed
              activeDetailTab={activeDetailTab}
              assignedEquipment={assignedWork?.equipment ?? []}
              canReplaceRemoveEquipment={canReplaceRemoveEquipment}
              currentEmployeeId={employee.id}
              locationLookup={locationLookup}
              onChangeDetailTab={setActiveDetailTab}
              onCommitFinishReview={queueAppointmentFinishReview}
              onConfirmDiscardQueuedOperation={confirmDiscardQueuedOperation}
              onConfirmVoidRegisterEntry={confirmVoidRegisterEntry}
              onCreateEquipmentAtLocation={createEquipmentAtLocation}
              onLinkReplacement={linkReplacement}
              onOpenJobDetail={openJobDetail}
              onQueueAppointmentStatus={queueAppointmentStatus}
              onQueueEquipmentUpdate={queueEquipmentUpdate}
              onQueueJobNote={queueJobNote}
              onQueueMediaUpload={queueMediaUpload}
              onQueueRegisterEntryCreate={queueRegisterEntryCreate}
              onQueueRegisterEntryEdit={queueRegisterEntryEdit}
              onRetryQueuedOperation={(operationId) => void retryQueuedOperation(operationId)}
              onReturnToHome={returnToHome}
              pendingOperations={pendingOperations}
              scheduledJobs={scheduledJobs}
              selectedJobId={selectedJobId}
              syncLastSuccessfulAt={syncMetadata.lastSuccessfulSyncAt}
            />
          ) : null}

          {activeWorkspaceTab === 'sync' ? (
            <FieldSyncSurface
              assignedWork={assignedWork}
              isRefreshing={isRefreshing}
              isSyncing={isSyncing}
              onDiscardQueuedOperation={confirmDiscardQueuedOperation}
              onRefresh={() => void refreshAssignedWork()}
              onRetryQueuedOperation={(operationId) => void retryQueuedOperation(operationId)}
              onSyncNow={() => void syncNow()}
              pendingOperations={pendingOperations}
              syncHealth={syncHealth}
              syncMetadata={syncMetadata}
            />
          ) : null}

          {activeWorkspaceTab === 'messages' ? <FieldUnavailableSurface kind="messages" /> : null}

          {activeWorkspaceTab === 'settings' ? <FieldUnavailableSurface kind="settings" /> : null}
        </View>
      </ScrollView>
      <FieldWorkspaceBottomNav
        activeTab={activeWorkspaceTab}
        onChangeTab={setActiveWorkspaceTab}
        safeAreaBottom={safeAreaInsets.bottom}
      />
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}
