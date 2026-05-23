import { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  addFieldJobNote,
  createFieldEquipment,
  getAssignedFieldWork,
  linkFieldEquipmentReplacement,
  updateFieldAppointmentStatus,
  updateFieldEquipment,
  type AppointmentFinishOutcome,
  type AppointmentStatus,
  type EquipmentStatus,
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
  formatFinishOutcome,
  formatPendingOperation,
  mergeEquipmentMutationIntoAssignedWork,
  mergeJobMutationIntoAssignedWork
} from './field-pending-replay';
import { buildSuccessfulSyncMetadata, summarizeSyncHealth, type SyncTone } from './field-sync-status';
import {
  buildAppointmentOwnershipWarning,
  formatAppointmentAssignmentLine,
  shouldConfirmAppointmentOwnership
} from './field-assignment-display';

type Props = {
  apiBaseUrl: string;
  employee: EmployeeSummary;
  sessionToken: string;
  onSignOut: () => void;
};

type EquipmentDraft = {
  model: string;
  serialNumber: string;
  filterSizes: string;
  equipmentLocationDescription: string;
  installDate: string;
  status: EquipmentStatus;
  notes: string;
};

type EquipmentCreateDraft = {
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string;
  equipmentLocationDescription: string;
  installDate: string;
  warrantyStartDate: string;
  warrantyEndDate: string;
  warrantyProviderNote: string;
  systemGroupName: string;
  status: EquipmentStatus;
  notes: string;
};

type FinishReviewState = {
  jobId: string;
  appointmentId: string;
  visitNotes: string;
  finishOutcome: AppointmentFinishOutcome;
  hasChargeActivity: boolean;
  registerReminder: string;
};

type FieldAppointment = FieldAssignedWorkResponse['jobs'][number]['appointments'][number];

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

const defaultSyncMetadata: SyncMetadata = {
  lastSuccessfulSyncAt: null,
  lastAttemptedSyncAt: null,
  lastSnapshotVersion: null,
  lastSyncError: null
};

function getSyncHealthCardStyle(tone: SyncTone) {
  if (tone === 'alert') {
    return { backgroundColor: '#fdecea', borderColor: '#f1b1ab' };
  }

  if (tone === 'attention') {
    return { backgroundColor: '#fff7e1', borderColor: '#e7d391' };
  }

  return undefined;
}

export function TechnicianWorkspaceScreen({ apiBaseUrl, employee, sessionToken, onSignOut }: Props) {
  const [serverSnapshot, setServerSnapshot] = useState<AssignedWorkSnapshot | null>(null);
  const [pendingOperations, setPendingOperations] = useState<PendingOperation[]>([]);
  const [syncMetadata, setSyncMetadata] = useState<SyncMetadata>(defaultSyncMetadata);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [equipmentDrafts, setEquipmentDrafts] = useState<Record<string, EquipmentDraft>>({});
  const [equipmentCreateDrafts, setEquipmentCreateDrafts] = useState<Record<string, EquipmentCreateDraft>>({});
  const [replacementSelections, setReplacementSelections] = useState<Record<string, string>>({});
  const [finishReview, setFinishReview] = useState<FinishReviewState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

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
  const canReplaceRemoveEquipment = employee.effectivePermissions.includes('equipment:configure');

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
        setServerSnapshot(nextAssignedWork);
        setSyncMetadata(nextSyncMetadata);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load BellField field storage.');
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

  async function queueJobNote(jobId: string, noteOverride?: string) {
    const note = (noteOverride ?? noteDrafts[jobId] ?? '').trim();

    if (!note) {
      return;
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

      if (noteOverride === undefined) {
        setNoteDrafts((current) => ({ ...current, [jobId]: '' }));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the note locally.');
    }
  }

  async function queueAppointmentStatus(appointmentId: string, status: AppointmentStatus) {
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
              (operation.kind === 'appointmentStatus' || operation.kind === 'appointmentFinishReview') &&
              operation.appointmentId === appointmentId
            )
        ),
        nextOperation
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the appointment status locally.');
    }
  }

  async function queueAppointmentFinishReview(currentFinishReview: FinishReviewState) {
    const baseUpdatedAt = findAppointmentBaseUpdatedAt(serverSnapshot, currentFinishReview.appointmentId);
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
              (operation.kind === 'appointmentStatus' || operation.kind === 'appointmentFinishReview') &&
              operation.appointmentId === currentFinishReview.appointmentId
            )
        ),
        nextOperation
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the finish review locally.');
    }
  }

  async function queueEquipmentUpdate(record: FieldAssignedWorkResponse['equipment'][number]) {
    const draft = equipmentDrafts[record.id] ?? createEquipmentDraft(record);
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
        ...current.filter((operation) => !(operation.kind === 'equipmentUpdate' && operation.equipmentId === record.id)),
        nextOperation
      ]);
      setEquipmentDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[record.id];
        return nextDrafts;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the equipment change locally.');
    }
  }

  function updateEquipmentDraft(
    record: FieldAssignedWorkResponse['equipment'][number],
    patch: Partial<EquipmentDraft>
  ) {
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

  async function createEquipmentAtLocation(locationId: string) {
    const draft = equipmentCreateDrafts[locationId] ?? createEquipmentCreateDraft();

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
      setEquipmentCreateDrafts((current) => ({
        ...current,
        [locationId]: createEquipmentCreateDraft()
      }));
      await refreshAssignedWork(false);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Serial number is strongly recommended')
      ) {
        Alert.alert('Create without serial?', 'Serial number is blank. Create this equipment record anyway?', [
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
              }).then(() => refreshAssignedWork(false)).catch((createError) => {
                setErrorMessage(createError instanceof Error ? createError.message : 'Unable to create equipment.');
              });
            }
          }
        ]);
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Unable to create equipment.');
    }
  }

  async function linkReplacement(recordId: string) {
    const replacementEquipmentId = replacementSelections[recordId];

    if (!replacementEquipmentId) {
      return;
    }

    try {
      await linkFieldEquipmentReplacement({
        equipmentId: recordId,
        replacementEquipmentId,
        sessionToken,
        apiBaseUrl
      });
      setReplacementSelections((current) => ({ ...current, [recordId]: '' }));
      await refreshAssignedWork(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to link replacement equipment.');
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

  function handleAppointmentStatusPress(jobId: string, appointment: FieldAppointment, status: AppointmentStatus) {
    const continueStatusChange = () => {
      if (status === 'finished') {
        beginFinishReview(jobId, appointment.id);
        return;
      }

      setFinishReview((current) => (current?.appointmentId === appointment.id ? null : current));
      void queueAppointmentStatus(appointment.id, status);
    };

    if (shouldConfirmAppointmentOwnership(appointment, employee.id)) {
      Alert.alert(
        'Appointment not assigned to you',
        buildAppointmentOwnershipWarning(appointment, employee.id, `marking it ${formatAppointmentStatusLabel(status)}`),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: continueStatusChange }
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
        'Finish without notes?',
        'BellField should prompt for visit notes before the appointment is marked finished. Continue anyway?',
        [
          { text: 'Add notes', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => commitFinishReview(true, allowNoNotesAndNoCharges)
          }
        ]
      );
      return;
    }

    if (!visitNotes && !currentFinishReview.hasChargeActivity && !allowNoNotesAndNoCharges) {
      Alert.alert(
        'Finish with no notes and no charges?',
        'This finish review has no visit notes and no charge activity. BellField should warn before continuing.',
        [
          { text: 'Go back', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => commitFinishReview(true, true)
          }
        ]
      );
      return;
    }

    void (async () => {
      await queueAppointmentFinishReview(currentFinishReview);
      setFinishReview(null);
    })();
  }

  async function syncNow() {
    setIsSyncing(true);
    setErrorMessage(null);

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

      async function preserveAppliedOperation(operationId: string, nextSnapshot: AssignedWorkSnapshot) {
        currentServerSnapshot = nextSnapshot;
        await saveAssignedWorkSnapshot(currentServerSnapshot);
        setServerSnapshot(currentServerSnapshot);
        await removePendingOperation(operationId);
        setPendingOperations((current) => current.filter((entry) => entry.id !== operationId));
      }

      for (const operation of [...pendingOperations].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))) {
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
              await updatePendingOperationState(operation.id, 'conflict', response.syncResult.message);
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? { ...entry, state: 'conflict', lastResultMessage: response.syncResult?.message }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(operation.id, 'rejected', response.syncResult.message);
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? { ...entry, state: 'rejected', lastResultMessage: response.syncResult?.message }
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
              await updatePendingOperationState(operation.id, 'conflict', response.syncResult.message);
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? { ...entry, state: 'conflict', lastResultMessage: response.syncResult?.message }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(operation.id, 'rejected', response.syncResult.message);
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? { ...entry, state: 'rejected', lastResultMessage: response.syncResult?.message }
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
              await updatePendingOperationState(operation.id, 'conflict', response.syncResult.message);
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? { ...entry, state: 'conflict', lastResultMessage: response.syncResult?.message }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(operation.id, 'rejected', response.syncResult.message);
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? { ...entry, state: 'rejected', lastResultMessage: response.syncResult?.message }
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
              await updatePendingOperationState(operation.id, 'conflict', response.syncResult.message);
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? { ...entry, state: 'conflict', lastResultMessage: response.syncResult?.message }
                    : entry
                )
              );
            } else if (response.syncResult?.status === 'rejected') {
              await updatePendingOperationState(operation.id, 'rejected', response.syncResult.message);
              setPendingOperations((current) =>
                current.map((entry) =>
                  entry.id === operation.id
                    ? { ...entry, state: 'rejected', lastResultMessage: response.syncResult?.message }
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
          const nextErrorMessage = error instanceof Error ? error.message : 'Unable to sync queued field work.';
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
        return;
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
    } catch (error) {
      const nextErrorMessage = error instanceof Error ? error.message : 'Unable to sync queued field work.';
      const failedMetadata: SyncMetadata = {
        ...attemptedMetadata,
        lastSyncError: nextErrorMessage
      };

      await saveSyncMetadata(failedMetadata);
      setSyncMetadata(failedMetadata);
      setErrorMessage(nextErrorMessage);
    } finally {
      setIsSyncing(false);
    }
  }

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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.kicker}>BellField Field</Text>
          <Text style={styles.title}>{employee.displayName}</Text>
          <Text style={styles.subtitle}>
            Assigned work, the pending sync queue, and sync health now persist on-device. Office still only sees field
            changes after save and successful sync.
          </Text>

          <View
            accessibilityLabel={`Sync status: ${syncHealth.headline}`}
            style={[styles.summaryCard, getSyncHealthCardStyle(syncHealth.tone)]}
          >
            <Text style={styles.sectionTitle}>{syncHealth.headline}</Text>
            {syncHealth.detail ? <Text style={styles.summaryText}>{syncHealth.detail}</Text> : null}
            {syncHealth.tone === 'quiet' ? (
              <Text style={styles.summaryText}>
                Background sync is healthy. Field edits stay protected on this device until the next sync.
              </Text>
            ) : null}
            <Text style={styles.summaryText}>
              Scope: {assignedWork?.windowStartDate ?? 'today'} through {assignedWork?.windowEndDate ?? 'tomorrow'}
            </Text>
            <Text style={styles.summaryText}>
              Last successful sync: {syncMetadata.lastSuccessfulSyncAt ?? 'Not synced yet'}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <Pressable onPress={() => void refreshAssignedWork()} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{isRefreshing ? 'Refreshing...' : 'Refresh jobs'}</Text>
            </Pressable>
            <Pressable onPress={() => void syncNow()} style={styles.primaryButton}>
              {isSyncing ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Sync Now</Text>}
            </Pressable>
            <Pressable onPress={handleSignOut} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Sign out</Text>
            </Pressable>
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {(assignedWork?.jobs ?? []).map((job) => {
            const location = locationLookup.get(job.locationId);
            const equipment = (assignedWork?.equipment ?? []).filter((record) => record.locationId === job.locationId);

            return (
              <View key={job.id} style={styles.summaryCard}>
                <Text style={styles.sectionTitle}>
                  Job {job.jobNumber}: {job.summary}
                </Text>
                <Text style={styles.summaryText}>
                  {location?.name} - {location?.addressLine1} - {job.billToCustomerName}
                </Text>
                <Text style={styles.summaryText}>
                  Contacts: {location?.contacts.map((contact) => contact.displayName).join(', ') || 'None'}
                </Text>

                {job.appointments.map((appointment) => {
                  const assignmentLine = formatAppointmentAssignmentLine(appointment, employee.id);
                  return (
                    <View key={appointment.id} style={styles.block}>
                      <Text style={styles.sectionTitleSmall}>
                        {appointment.scheduledDate || 'Unscheduled'} - {appointment.timeWindowLabel || 'No window'}
                      </Text>
                      <Text style={styles.summaryText}>{assignmentLine}</Text>
                      <Text style={styles.summaryText}>Latest local appointment status: {appointment.status}</Text>
                      <View style={styles.actionRow}>
                        {fieldAppointmentStatuses.map((status) => (
                          <Pressable
                            key={status}
                            onPress={() => handleAppointmentStatusPress(job.id, appointment, status)}
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
                          BellField should prompt for notes, outcome, and charge activity before finishing this visit.
                        </Text>
                        <Text style={styles.summaryText}>Outcome: {formatFinishOutcome(finishReview.finishOutcome)}</Text>
                        <View style={styles.actionRow}>
                          {(['completed', 'followUpNeeded', 'noAccess'] as AppointmentFinishOutcome[]).map((outcome) => (
                            <Pressable
                              key={outcome}
                              onPress={() =>
                                setFinishReview((current) =>
                                  current && current.appointmentId === appointment.id
                                    ? { ...current, finishOutcome: outcome }
                                    : current
                                )
                              }
                              style={styles.tagButton}
                            >
                              <Text style={styles.tagButtonText}>{formatFinishOutcome(outcome)}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text style={styles.summaryText}>
                          Charge activity: {finishReview.hasChargeActivity ? 'Yes' : 'No'}
                        </Text>
                        <View style={styles.actionRow}>
                          <Pressable
                            onPress={() =>
                              setFinishReview((current) =>
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
                              setFinishReview((current) =>
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
                            setFinishReview((current) =>
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
                            setFinishReview((current) =>
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
                          <Pressable onPress={() => commitFinishReview(false, false)} style={styles.primaryButton}>
                            <Text style={styles.primaryButtonText}>Save finish locally</Text>
                          </Pressable>
                          <Pressable onPress={() => setFinishReview(null)} style={styles.secondaryButton}>
                            <Text style={styles.secondaryButtonText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                    </View>
                  );
                })}

                <View style={styles.block}>
                  <Text style={styles.sectionTitleSmall}>Save note locally</Text>
                  <Text style={styles.summaryText}>This note stays on-device until Sync Now applies it on the server.</Text>
                  <TextInput
                    value={noteDrafts[job.id] ?? ''}
                    onChangeText={(value) => setNoteDrafts((current) => ({ ...current, [job.id]: value }))}
                    multiline
                    placeholder="Add visit notes that should queue until sync."
                    style={styles.input}
                  />
                  <Pressable onPress={() => void queueJobNote(job.id)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Save note locally</Text>
                  </Pressable>
                </View>

                {equipment.map((record) => (
                  <View key={record.id} style={styles.block}>
                    {(() => {
                      const equipmentDraft = equipmentDrafts[record.id] ?? createEquipmentDraft(record);
                      const replacementOptions = equipment.filter(
                        (candidate) =>
                          candidate.id !== record.id &&
                          candidate.locationId === record.locationId &&
                          candidate.inventoryLocationLabel === record.inventoryLocationLabel
                      );

                      return (
                        <>
                    <Text style={styles.sectionTitleSmall}>
                      {record.equipmentType}: {record.brand} {record.model}
                    </Text>
                    <Text style={styles.summaryText}>Serial: {record.serialNumber}</Text>
                    <Text style={styles.summaryText}>Age: {record.ageLabel ?? 'Unknown age'}</Text>
                    <Text style={styles.summaryText}>System group: {record.systemGroup?.name ?? 'Ungrouped'}</Text>
                    <Text style={styles.summaryText}>Current local equipment status: {record.status}</Text>
                    <View style={styles.actionRow}>
                      {([
                        'active',
                        'pendingInstall',
                        'inactive',
                        ...(canReplaceRemoveEquipment ? (['removed'] as EquipmentStatus[]) : [])
                      ] as EquipmentStatus[]).map((status) => (
                        <Pressable
                          key={status}
                          onPress={() => updateEquipmentDraft(record, { status })}
                          style={styles.tagButton}
                        >
                          <Text style={styles.tagButtonText}>{status}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      value={equipmentDraft.model}
                      onChangeText={(value) => updateEquipmentDraft(record, { model: value })}
                      placeholder="Model"
                      style={styles.input}
                    />
                    <TextInput
                      value={equipmentDraft.serialNumber}
                      onChangeText={(value) => updateEquipmentDraft(record, { serialNumber: value })}
                      placeholder="Serial number"
                      style={styles.input}
                    />
                    <TextInput
                      value={equipmentDraft.filterSizes}
                      onChangeText={(value) => updateEquipmentDraft(record, { filterSizes: value })}
                      placeholder="Filters (comma separated)"
                      style={styles.input}
                    />
                    <TextInput
                      value={equipmentDraft.equipmentLocationDescription}
                      onChangeText={(value) => updateEquipmentDraft(record, { equipmentLocationDescription: value })}
                      placeholder="Equipment location"
                      style={styles.input}
                    />
                    <TextInput
                      value={equipmentDraft.installDate}
                      onChangeText={(value) => updateEquipmentDraft(record, { installDate: value })}
                      placeholder="Install date (YYYY-MM-DD)"
                      style={styles.input}
                    />
                    {record.warrantyProviderNote ? (
                      <Text style={styles.summaryText}>Warranty: {record.warrantyProviderNote}</Text>
                    ) : null}
                    <TextInput
                      value={equipmentDraft.notes}
                      onChangeText={(value) => updateEquipmentDraft(record, { notes: value })}
                      multiline
                      placeholder="Equipment notes"
                      style={styles.input}
                    />
                    <Pressable onPress={() => void queueEquipmentUpdate(record)} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Save equipment locally</Text>
                    </Pressable>
                    {canReplaceRemoveEquipment && replacementOptions.length > 0 ? (
                      <View style={styles.block}>
                        <Text style={styles.sectionTitleSmall}>Link replacement</Text>
                        <TextInput
                          value={replacementSelections[record.id] ?? ''}
                          onChangeText={(value) => setReplacementSelections((current) => ({ ...current, [record.id]: value }))}
                          placeholder={`Replacement equipment id (${replacementOptions[0]?.id ?? 'select from office list'})`}
                          style={styles.input}
                        />
                        <Pressable onPress={() => void linkReplacement(record.id)} style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>Link replacement now</Text>
                        </Pressable>
                      </View>
                    ) : null}
                        </>
                      );
                    })()}
                  </View>
                ))}

                <View style={styles.block}>
                  <Text style={styles.sectionTitleSmall}>Add equipment at this location</Text>
                  {(() => {
                    const createDraft = equipmentCreateDrafts[job.locationId] ?? createEquipmentCreateDraft();

                    return (
                      <>
                        <TextInput
                          value={createDraft.equipmentType}
                          onChangeText={(value) => updateEquipmentCreateDraft(job.locationId, { equipmentType: value })}
                          placeholder="Equipment type"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.brand}
                          onChangeText={(value) => updateEquipmentCreateDraft(job.locationId, { brand: value })}
                          placeholder="Brand"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.model}
                          onChangeText={(value) => updateEquipmentCreateDraft(job.locationId, { model: value })}
                          placeholder="Model"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.serialNumber}
                          onChangeText={(value) => updateEquipmentCreateDraft(job.locationId, { serialNumber: value })}
                          placeholder="Serial number"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.filterSizes}
                          onChangeText={(value) => updateEquipmentCreateDraft(job.locationId, { filterSizes: value })}
                          placeholder="Filters (comma separated)"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.equipmentLocationDescription}
                          onChangeText={(value) =>
                            updateEquipmentCreateDraft(job.locationId, { equipmentLocationDescription: value })
                          }
                          placeholder="Equipment location"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.installDate}
                          onChangeText={(value) => updateEquipmentCreateDraft(job.locationId, { installDate: value })}
                          placeholder="Install date (YYYY-MM-DD)"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.warrantyStartDate}
                          onChangeText={(value) =>
                            updateEquipmentCreateDraft(job.locationId, { warrantyStartDate: value })
                          }
                          placeholder="Warranty start (YYYY-MM-DD)"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.warrantyEndDate}
                          onChangeText={(value) => updateEquipmentCreateDraft(job.locationId, { warrantyEndDate: value })}
                          placeholder="Warranty end (YYYY-MM-DD)"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.warrantyProviderNote}
                          onChangeText={(value) =>
                            updateEquipmentCreateDraft(job.locationId, { warrantyProviderNote: value })
                          }
                          placeholder="Warranty provider or note"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.systemGroupName}
                          onChangeText={(value) => updateEquipmentCreateDraft(job.locationId, { systemGroupName: value })}
                          placeholder="System group name"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.notes}
                          onChangeText={(value) => updateEquipmentCreateDraft(job.locationId, { notes: value })}
                          multiline
                          placeholder="Equipment notes"
                          style={styles.input}
                        />
                        <Pressable onPress={() => void createEquipmentAtLocation(job.locationId)} style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>Create equipment now</Text>
                        </Pressable>
                      </>
                    );
                  })()}
                </View>
              </View>
            );
          })}

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Pending queue</Text>
            {pendingOperations.length === 0 ? (
              <Text style={styles.summaryText}>No local changes waiting for sync.</Text>
            ) : (
              pendingOperations.map((operation) => (
                <Text key={operation.id} style={styles.summaryText}>
                  {formatPendingOperation(operation)}
                </Text>
              ))
            )}
          </View>
        </View>
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

function createEquipmentDraft(record: FieldAssignedWorkResponse['equipment'][number]): EquipmentDraft {
  return {
    model: record.model,
    serialNumber: record.serialNumber,
    filterSizes: record.filterSizes.join(', '),
    equipmentLocationDescription: record.equipmentLocationDescription ?? '',
    installDate: record.installDate ?? '',
    status: record.status,
    notes: record.notes
  };
}

function createEquipmentCreateDraft(): EquipmentCreateDraft {
  return {
    equipmentType: 'Condenser',
    brand: 'Carrier',
    model: '',
    serialNumber: '',
    filterSizes: '16x25x1',
    equipmentLocationDescription: '',
    installDate: '',
    warrantyStartDate: '',
    warrantyEndDate: '',
    warrantyProviderNote: '',
    systemGroupName: '',
    status: 'active',
    notes: ''
  };
}

function formatAppointmentStatusLabel(status: AppointmentStatus): string {
  if (status === 'onTheWay') {
    return 'on the way';
  }

  if (status === 'noAnswer') {
    return 'no answer';
  }

  return status;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2efe6' },
  scrollContent: { flexGrow: 1, padding: 20 },
  loadingState: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#fffdf8',
    borderColor: '#e4d6bc',
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
    padding: 20
  },
  kicker: { color: '#936327', fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: '#1f2933', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#52606d', fontSize: 15, lineHeight: 22 },
  summaryCard: { backgroundColor: '#ffffff', borderColor: '#ebdec6', borderRadius: 18, borderWidth: 1, gap: 8, padding: 16 },
  block: { backgroundColor: '#faf7ef', borderRadius: 14, gap: 8, padding: 12 },
  reviewCard: { backgroundColor: '#f3f7ef', borderColor: '#d5e2cd', borderRadius: 14, borderWidth: 1, gap: 8, padding: 12 },
  sectionTitle: { color: '#1f2933', fontSize: 17, fontWeight: '600' },
  sectionTitleSmall: { color: '#1f2933', fontSize: 15, fontWeight: '600' },
  summaryText: { color: '#52606d', fontSize: 14, lineHeight: 20 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d9c8ad',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top'
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: { alignItems: 'center', backgroundColor: '#1c6b57', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: '#cdbfa6', borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  secondaryButtonText: { color: '#1f2933', fontSize: 14, fontWeight: '600' },
  tagButton: { backgroundColor: '#eef2e5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  tagButtonText: { color: '#33523d', fontSize: 13, fontWeight: '600' },
  errorText: { color: '#b42318', fontSize: 14 }
});
