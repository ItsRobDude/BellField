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
  registerReminder: string;
};

const fieldAppointmentStatuses: AppointmentStatus[] = [
  'assigned',
  'confirmed',
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

  const pendingCount = pendingOperations.filter((operation) => operation.state === 'pending').length;
  const conflictedCount = pendingOperations.filter((operation) => operation.state === 'conflict').length;
  const rejectedCount = pendingOperations.filter((operation) => operation.state === 'rejected').length;
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
        const nextSyncMetadata: SyncMetadata = {
          ...persistedMetadata,
          lastSnapshotVersion: nextAssignedWork.snapshotVersion,
          lastSyncError: null
        };

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
      const nextSyncMetadata: SyncMetadata = {
        ...(metadataOverride ?? syncMetadata),
        lastSnapshotVersion: nextAssignedWork.snapshotVersion,
        lastSyncError: null
      };

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
        ...current.filter((operation) => !(operation.kind === 'appointmentStatus' && operation.appointmentId === appointmentId)),
        nextOperation
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the appointment status locally.');
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
            registerReminder: ''
          }
    );
  }

  function handleAppointmentStatusPress(jobId: string, appointmentId: string, status: AppointmentStatus) {
    if (status === 'finished') {
      beginFinishReview(jobId, appointmentId);
      return;
    }

    setFinishReview((current) => (current?.appointmentId === appointmentId ? null : current));
    void queueAppointmentStatus(appointmentId, status);
  }

  function commitFinishReview(allowEmptyNotes: boolean) {
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
            onPress: () => commitFinishReview(true)
          }
        ]
      );
      return;
    }

    void (async () => {
      if (visitNotes) {
        await queueJobNote(currentFinishReview.jobId, visitNotes);
      }

      const registerReminder = currentFinishReview.registerReminder.trim();

      if (registerReminder) {
        await queueJobNote(currentFinishReview.jobId, `Register / follow-up: ${registerReminder}`);
      }

      await queueAppointmentStatus(currentFinishReview.appointmentId, 'finished');
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

      let shouldStopEarly = false;
      let hadSyncFailure = false;

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
              await removePendingOperation(operation.id);
              setPendingOperations((current) => current.filter((entry) => entry.id !== operation.id));
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
              await removePendingOperation(operation.id);
              setPendingOperations((current) => current.filter((entry) => entry.id !== operation.id));
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
              await removePendingOperation(operation.id);
              setPendingOperations((current) => current.filter((entry) => entry.id !== operation.id));
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
      const nextSyncMetadata: SyncMetadata = {
        ...attemptedMetadata,
        lastAttemptedSyncAt: attemptedAt,
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastSnapshotVersion: refreshedSnapshot.snapshotVersion,
        lastSyncError: null
      };

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

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Sync foundation</Text>
            <Text style={styles.summaryText}>Pending local saves: {pendingCount}</Text>
            <Text style={styles.summaryText}>Conflicts to review: {conflictedCount}</Text>
            <Text style={styles.summaryText}>Rejected items: {rejectedCount}</Text>
            <Text style={styles.summaryText}>Server snapshot: {assignedWork?.serverTime ?? 'Not loaded yet'}</Text>
            <Text style={styles.summaryText}>Snapshot version: {assignedWork?.snapshotVersion ?? 'Not loaded yet'}</Text>
            <Text style={styles.summaryText}>Last successful sync: {syncMetadata.lastSuccessfulSyncAt ?? 'Not synced yet'}</Text>
            <Text style={styles.summaryText}>Last attempted sync: {syncMetadata.lastAttemptedSyncAt ?? 'Not attempted yet'}</Text>
            <Text style={styles.summaryText}>
              Scope: {assignedWork?.windowStartDate ?? 'today'} through {assignedWork?.windowEndDate ?? 'tomorrow'}
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
          {syncMetadata.lastSyncError ? <Text style={styles.errorText}>{syncMetadata.lastSyncError}</Text> : null}

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

                {job.appointments.map((appointment) => (
                  <View key={appointment.id} style={styles.block}>
                    <Text style={styles.sectionTitleSmall}>
                      {appointment.scheduledDate || 'Unscheduled'} - {appointment.timeWindowLabel || 'No window'}
                    </Text>
                    <Text style={styles.summaryText}>{appointment.technicianName || employee.displayName}</Text>
                    <Text style={styles.summaryText}>Latest local appointment status: {appointment.status}</Text>
                    <View style={styles.actionRow}>
                      {fieldAppointmentStatuses.map((status) => (
                        <Pressable
                          key={status}
                          onPress={() => handleAppointmentStatusPress(job.id, appointment.id, status)}
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
                          BellField should prompt for notes and register items before finishing this visit.
                        </Text>
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
                          <Pressable onPress={() => commitFinishReview(false)} style={styles.primaryButton}>
                            <Text style={styles.primaryButtonText}>Save finish locally</Text>
                          </Pressable>
                          <Pressable onPress={() => setFinishReview(null)} style={styles.secondaryButton}>
                            <Text style={styles.secondaryButtonText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ))}

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

function applyPendingOperations(
  snapshot: AssignedWorkSnapshot | null,
  pendingOperations: PendingOperation[],
  actorName: string
): FieldAssignedWorkResponse | null {
  if (!snapshot) {
    return null;
  }

  let nextSnapshot: FieldAssignedWorkResponse = {
    ...snapshot,
    jobs: snapshot.jobs.map((job) => ({
      ...job,
      appointments: job.appointments.map((appointment) => ({ ...appointment })),
      timeline: job.timeline.map((entry) => ({ ...entry }))
    })),
    locations: snapshot.locations.map((location) => ({
      ...location,
      contacts: location.contacts.map((contact) => ({ ...contact }))
    })),
    customers: snapshot.customers.map((customer) => ({ ...customer })),
    equipment: snapshot.equipment.map((record) => ({ ...record }))
  };

  for (const operation of pendingOperations) {
    if (operation.kind === 'jobNote') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) =>
          job.id === operation.jobId
            ? {
                ...job,
                timeline: [
                  ...job.timeline,
                  {
                    id: `${operation.id}-local`,
                    occurredAt: operation.occurredAt,
                    actorName,
                    message: operation.note,
                    kind: 'jobNote'
                  }
                ]
              }
            : job
        )
      };
    }

    if (operation.kind === 'appointmentStatus') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) => ({
          ...job,
          appointments: job.appointments.map((appointment) =>
            appointment.id === operation.appointmentId ? { ...appointment, status: operation.status } : appointment
          )
        }))
      };
    }

    if (operation.kind === 'equipmentUpdate') {
      nextSnapshot = {
        ...nextSnapshot,
        equipment: nextSnapshot.equipment.map((record) =>
          record.id === operation.equipmentId
            ? {
                ...record,
                model: operation.model ?? record.model,
                serialNumber: operation.serialNumber ?? record.serialNumber,
                filterSizes: operation.filterSizes ?? record.filterSizes,
                equipmentLocationDescription: operation.equipmentLocationDescription ?? record.equipmentLocationDescription,
                installDate: operation.installDate ?? record.installDate,
                status: operation.status,
                notes: operation.notes
              }
            : record
        )
      };
    }
  }

  return nextSnapshot;
}

function findAppointmentBaseUpdatedAt(snapshot: AssignedWorkSnapshot | null, appointmentId: string): string | undefined {
  return snapshot?.jobs.flatMap((job) => job.appointments).find((appointment) => appointment.id === appointmentId)?.updatedAt;
}

function findJobBaseUpdatedAt(snapshot: AssignedWorkSnapshot | null, jobId: string): string | undefined {
  return snapshot?.jobs.find((job) => job.id === jobId)?.updatedAt;
}

function findEquipmentBaseUpdatedAt(snapshot: AssignedWorkSnapshot | null, equipmentId: string): string | undefined {
  return snapshot?.equipment.find((record) => record.id === equipmentId)?.updatedAt;
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

function formatPendingOperation(operation: PendingOperation): string {
  const stateSuffix =
    operation.state === 'pending'
      ? 'pending sync'
      : operation.state === 'conflict'
        ? `conflict${operation.lastResultMessage ? `: ${operation.lastResultMessage}` : ''}`
        : `rejected${operation.lastResultMessage ? `: ${operation.lastResultMessage}` : ''}`;

  if (operation.kind === 'jobNote') {
    return `Job note saved locally at ${new Date(operation.occurredAt).toLocaleTimeString()} (${stateSuffix})`;
  }

  if (operation.kind === 'appointmentStatus') {
    return `Appointment status queued: ${operation.status} (${stateSuffix})`;
  }

  return `Equipment update queued: ${operation.status} (${stateSuffix})`;
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
