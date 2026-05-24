import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
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
  type AppointmentFinishOutcome,
  type AppointmentStatus,
  type EquipmentStatus,
  type FieldAssignedWorkResponse,
  type RegisterEntryKind
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
import {
  formatAppointmentSchedule,
  formatFieldLocationAddress,
  formatFinishedReviewAcknowledgement,
  formatWorkOrderLine,
  summarizeAppointmentQueueState,
  summarizeOfficeAppointmentChanges
} from './field-appointment-display';
import {
  discardPendingOperation as discardPendingOperationFromQueue,
  getReplayablePendingOperations,
  markPendingOperationForRetry,
  shouldOfferQueueResolution
} from './field-queue-resolution';
import {
  nextBackgroundSyncDelayMs,
  shouldRunBackgroundSync
} from './field-background-sync-schedule';
import { deleteStagedFieldMedia, pickFieldMedia, type FieldMediaSource } from './field-media-capture';
import { buildMediaUploadOperation } from './field-media-files';
import { replayFieldMediaUploadOperation } from './field-media-replay';
import { uploadFieldMediaBlob } from './field-media-upload';
import {
  buildFieldMediaCaptionDraftKey,
  countJobRegisterEntries,
  fieldDetailTabs,
  getPendingOperationsForJob,
  resolveSelectedFieldJob,
  shouldReturnToFieldHome,
  summarizeJobQueueBadge,
  type FieldDetailTab
} from './field-workspace-layout';

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

type RegisterEntryDraft = {
  appointmentId: string;
  registerEntryKind: RegisterEntryKind;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  totalAmount: string;
  partNumber: string;
  inventorySourceLabel: string;
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

const registerEntryKinds: RegisterEntryKind[] = ['labor', 'serviceItem', 'part', 'membership', 'other'];

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
  const [registerCreateDrafts, setRegisterCreateDrafts] = useState<Record<string, RegisterEntryDraft>>({});
  const [registerEditDrafts, setRegisterEditDrafts] = useState<Record<string, RegisterEntryDraft>>({});
  const [replacementSelections, setReplacementSelections] = useState<Record<string, string>>({});
  const [finishReview, setFinishReview] = useState<FinishReviewState | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<FieldDetailTab>('overview');
  const [mediaCaptionDrafts, setMediaCaptionDrafts] = useState<Record<string, string>>({});
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
  const selectedJob = resolveSelectedFieldJob(assignedJobs, selectedJobId);
  const canReplaceRemoveEquipment = employee.effectivePermissions.includes('equipment:configure');

  useEffect(() => {
    if (shouldReturnToFieldHome(assignedJobs, selectedJobId)) {
      setSelectedJobId(null);
      setActiveDetailTab('overview');
    }
  }, [assignedJobs, selectedJobId]);

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
        setOfficeChangeMessages(summarizeOfficeAppointmentChanges(persistedSnapshot, nextAssignedWork));
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

  function openJobDetail(jobId: string) {
    setSelectedJobId(jobId);
    setActiveDetailTab('overview');
  }

  function returnToHome() {
    setSelectedJobId(null);
    setActiveDetailTab('overview');
  }

  async function queueMediaUpload(
    job: FieldAssignedWorkResponse['jobs'][number],
    source: FieldMediaSource,
    appointmentId?: string
  ) {
    setErrorMessage(null);

    try {
      const stagedMedia = await pickFieldMedia(source);

      if (!stagedMedia) {
        return;
      }

      const captionKey = buildFieldMediaCaptionDraftKey({ jobId: job.id, appointmentId });
      const caption = mediaCaptionDrafts[captionKey]?.trim();
      const operation = buildMediaUploadOperation({
        jobId: job.id,
        appointmentId,
        stagedMedia,
        caption,
        baseUpdatedAt: findJobBaseUpdatedAt(serverSnapshot, job.id)
      });

      await queuePendingOperation(operation);
      setPendingOperations((current) => [...current, operation]);
      setMediaCaptionDrafts((current) => ({ ...current, [captionKey]: '' }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to queue media locally.');
    }
  }

  function updateRegisterCreateDraft(jobId: string, patch: Partial<RegisterEntryDraft>) {
    setRegisterCreateDrafts((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] ?? createRegisterEntryDraft()),
        ...patch
      }
    }));
  }

  function updateRegisterEditDraft(
    entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number],
    patch: Partial<RegisterEntryDraft>
  ) {
    setRegisterEditDrafts((current) => ({
      ...current,
      [entry.id]: {
        ...(current[entry.id] ?? createRegisterEntryDraft(entry)),
        ...patch
      }
    }));
  }

  async function queueRegisterEntryCreate(job: FieldAssignedWorkResponse['jobs'][number]) {
    const draft = registerCreateDrafts[job.id] ?? createRegisterEntryDraft();
    const parsed = parseRegisterEntryDraft(draft, false);

    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
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
      setRegisterCreateDrafts((current) => ({
        ...current,
        [job.id]: createRegisterEntryDraft({ appointmentId: draft.appointmentId || undefined })
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the register entry locally.');
    }
  }

  async function queueRegisterEntryEdit(
    entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number]
  ) {
    const draft = registerEditDrafts[entry.id] ?? createRegisterEntryDraft(entry);
    const parsed = parseRegisterEntryDraft(draft, true);

    if (!parsed.ok) {
      setErrorMessage(parsed.message);
      return;
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
      setRegisterEditDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[entry.id];
        return nextDrafts;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save the register edit locally.');
    }
  }

  function confirmVoidRegisterEntry(
    entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number]
  ) {
    Alert.alert('Void register entry?', 'This keeps the line in job history and queues a void for office sync.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void locally',
        style: 'destructive',
        onPress: () => {
          void queueRegisterEntryVoid(entry);
        }
      }
    ]);
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
      setErrorMessage(error instanceof Error ? error.message : 'Unable to void the register entry locally.');
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

  async function retryQueuedOperation(operationId: string) {
    setErrorMessage(null);

    try {
      await updatePendingOperationState(operationId, 'pending');
      setPendingOperations((current) => markPendingOperationForRetry(current, operationId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to mark the local change for retry.');
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
      setErrorMessage(error instanceof Error ? error.message : 'Unable to discard the local change.');
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

      async function preserveAppliedOperation(operationId: string, nextSnapshot: AssignedWorkSnapshot) {
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
                  entry.id === operation.id ? { ...entry, state: 'rejected', lastResultMessage: response.message } : entry
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
      const nextErrorMessage = error instanceof Error ? error.message : 'Unable to sync queued field work.';
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

          {officeChangeMessages.length > 0 ? (
            <View style={styles.noticeCard}>
              <Text style={styles.sectionTitle}>Office changed this work</Text>
              {officeChangeMessages.slice(0, 3).map((message) => (
                <Text key={message} style={styles.summaryText}>
                  {message}
                </Text>
              ))}
              {officeChangeMessages.length > 3 ? (
                <Text style={styles.summaryText}>Plus {officeChangeMessages.length - 3} more office update(s).</Text>
              ) : null}
            </View>
          ) : null}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {assignedJobs.map((job) => {
            const location = locationLookup.get(job.locationId);
            const equipment = (assignedWork?.equipment ?? []).filter((record) => record.locationId === job.locationId);
            const workOrderLine = formatWorkOrderLine(job);
            const queueBadge = summarizeJobQueueBadge(job, equipment, pendingOperations);
            const jobMediaCaptionKey = buildFieldMediaCaptionDraftKey({ jobId: job.id });

            if (selectedJob && selectedJob.id !== job.id) {
              return null;
            }

            if (!selectedJob) {
              return (
                <Pressable key={job.id} onPress={() => openJobDetail(job.id)} style={styles.jobHomeCard}>
                  <View style={styles.jobHomeHeader}>
                    <View style={styles.flexColumn}>
                      <Text style={styles.sectionTitle}>
                        Job {job.jobNumber}: {job.summary}
                      </Text>
                      {workOrderLine ? <Text style={styles.summaryText}>{workOrderLine}</Text> : null}
                    </View>
                    <Text
                      style={[
                        styles.queueBadge,
                        queueBadge.tone === 'alert'
                          ? styles.queueBadgeAlert
                          : queueBadge.tone === 'attention'
                            ? styles.queueBadgeAttention
                            : styles.queueBadgeQuiet
                      ]}
                    >
                      {queueBadge.label}
                    </Text>
                  </View>
                  <Text style={styles.summaryText}>
                    {location?.name ?? job.locationName} - {formatFieldLocationAddress(location)}
                  </Text>
                  <Text style={styles.summaryText}>
                    Appointments: {job.appointments.length} - Register: {countJobRegisterEntries(job)} - Equipment:{' '}
                    {equipment.length}
                  </Text>
                  <Text style={styles.pendingText}>Open job detail</Text>
                </Pressable>
              );
            }

            return (
              <View key={job.id} style={styles.summaryCard}>
                <View style={styles.detailHeaderRow}>
                  <Pressable onPress={returnToHome} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Back to jobs</Text>
                  </Pressable>
                  <Text
                    style={[
                      styles.queueBadge,
                      queueBadge.tone === 'alert'
                        ? styles.queueBadgeAlert
                        : queueBadge.tone === 'attention'
                          ? styles.queueBadgeAttention
                          : styles.queueBadgeQuiet
                    ]}
                  >
                    {queueBadge.label}
                  </Text>
                </View>
                <Text style={styles.sectionTitle}>
                  Job {job.jobNumber}: {job.summary}
                </Text>
                {workOrderLine ? <Text style={styles.summaryText}>{workOrderLine}</Text> : null}
                <Text style={styles.summaryText}>
                  {location?.name ?? job.locationName} - {formatFieldLocationAddress(location)} - {job.billToCustomerName}
                </Text>
                <Text style={styles.summaryText}>
                  Contacts: {location?.contacts.map((contact) => contact.displayName).join(', ') || 'None'}
                </Text>

                <View style={styles.segmentedControl}>
                  {fieldDetailTabs.map((tab) => (
                    <Pressable
                      key={tab.id}
                      onPress={() => setActiveDetailTab(tab.id)}
                      style={[styles.segmentButton, activeDetailTab === tab.id ? styles.segmentButtonActive : null]}
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
                </View>

                {activeDetailTab === 'appointments' ? job.appointments.map((appointment) => {
                  const assignmentLine = formatAppointmentAssignmentLine(appointment, employee.id);
                  const queueSummary = summarizeAppointmentQueueState(appointment.id, pendingOperations);
                  const finishedReviewAcknowledgement = formatFinishedReviewAcknowledgement(appointment);
                  const appointmentMediaCaptionKey = buildFieldMediaCaptionDraftKey({
                    jobId: job.id,
                    appointmentId: appointment.id
                  });
                  return (
                    <View key={appointment.id} style={styles.block}>
                      <Text style={styles.sectionTitleSmall}>{formatAppointmentSchedule(appointment)}</Text>
                      <Text style={styles.summaryText}>{assignmentLine}</Text>
                      {queueSummary ? (
                        <Text style={queueSummary.tone === 'alert' ? styles.errorText : styles.pendingText}>
                          {queueSummary.label}
                        </Text>
                      ) : null}
                      <Text style={styles.summaryText}>Latest local appointment status: {appointment.status}</Text>
                      {finishedReviewAcknowledgement ? (
                        <Text style={styles.summaryText}>{finishedReviewAcknowledgement}</Text>
                      ) : null}
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

                      <View style={styles.reviewCard}>
                        <Text style={styles.sectionTitleSmall}>Appointment media</Text>
                        <TextInput
                          value={mediaCaptionDrafts[appointmentMediaCaptionKey] ?? ''}
                          onChangeText={(value) =>
                            setMediaCaptionDrafts((current) => ({ ...current, [appointmentMediaCaptionKey]: value }))
                          }
                          placeholder="Optional caption for this visit"
                          style={styles.input}
                        />
                        <View style={styles.actionRow}>
                          <Pressable
                            onPress={() => void queueMediaUpload(job, 'camera', appointment.id)}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonText}>Capture media</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => void queueMediaUpload(job, 'library', appointment.id)}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonText}>Pick from library</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                }) : null}

                {activeDetailTab === 'overview' ? <View style={styles.block}>
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

                  <View style={styles.reviewCard}>
                    <Text style={styles.sectionTitleSmall}>Media</Text>
                    <Text style={styles.summaryText}>
                      Photos and videos are copied into BellField storage before they enter the sync queue.
                    </Text>
                    <TextInput
                      value={mediaCaptionDrafts[jobMediaCaptionKey] ?? ''}
                      onChangeText={(value) => setMediaCaptionDrafts((current) => ({ ...current, [jobMediaCaptionKey]: value }))}
                      placeholder="Optional caption"
                      style={styles.input}
                    />
                    <View style={styles.actionRow}>
                      <Pressable onPress={() => void queueMediaUpload(job, 'camera')} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Capture media</Text>
                      </Pressable>
                      <Pressable onPress={() => void queueMediaUpload(job, 'library')} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Pick from library</Text>
                      </Pressable>
                    </View>
                  </View>
                </View> : null}

                {activeDetailTab === 'register' ? <View style={styles.block}>
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
                            {entry.unitOfMeasure ? ` ${entry.unitOfMeasure}` : ''} - {formatCurrency(entry.totalAmount)}
                            {entry.isVoid ? ' - voided' : ''}
                          </Text>
                          {entry.voidReason ? <Text style={styles.pendingText}>Void reason: {entry.voidReason}</Text> : null}
                          {isLocalEntry ? (
                            <Text style={styles.pendingText}>
                              This line is queued locally. Wait for sync or discard it from the pending queue before changing it.
                            </Text>
                          ) : null}
                          {!entry.isVoid && !isLocalEntry ? (
                            <>
                              <View style={styles.actionRow}>
                                {registerEntryKinds.map((entryKind) => (
                                  <Pressable
                                    key={entryKind}
                                    onPress={() => updateRegisterEditDraft(entry, { registerEntryKind: entryKind })}
                                    style={styles.tagButton}
                                  >
                                    <Text style={styles.tagButtonText}>{formatRegisterEntryKind(entryKind)}</Text>
                                  </Pressable>
                                ))}
                              </View>
                              <TextInput
                                value={editDraft.description}
                                onChangeText={(value) => updateRegisterEditDraft(entry, { description: value })}
                                placeholder="Description"
                                style={styles.input}
                              />
                              <TextInput
                                value={editDraft.quantity}
                                onChangeText={(value) => updateRegisterEditDraft(entry, { quantity: value })}
                                keyboardType="decimal-pad"
                                placeholder="Quantity"
                                style={styles.input}
                              />
                              <TextInput
                                value={editDraft.unitOfMeasure}
                                onChangeText={(value) => updateRegisterEditDraft(entry, { unitOfMeasure: value })}
                                placeholder="Unit"
                                style={styles.input}
                              />
                              <TextInput
                                value={editDraft.unitPrice}
                                onChangeText={(value) => updateRegisterEditDraft(entry, { unitPrice: value })}
                                keyboardType="decimal-pad"
                                placeholder="Unit price"
                                style={styles.input}
                              />
                              <TextInput
                                value={editDraft.totalAmount}
                                onChangeText={(value) => updateRegisterEditDraft(entry, { totalAmount: value })}
                                keyboardType="decimal-pad"
                                placeholder="Total amount"
                                style={styles.input}
                              />
                              <TextInput
                                value={editDraft.partNumber}
                                onChangeText={(value) => updateRegisterEditDraft(entry, { partNumber: value })}
                                placeholder="Part number"
                                style={styles.input}
                              />
                              <TextInput
                                value={editDraft.inventorySourceLabel}
                                onChangeText={(value) => updateRegisterEditDraft(entry, { inventorySourceLabel: value })}
                                placeholder="Source label"
                                style={styles.input}
                              />
                              <View style={styles.actionRow}>
                                <Pressable onPress={() => void queueRegisterEntryEdit(entry)} style={styles.secondaryButton}>
                                  <Text style={styles.secondaryButtonText}>Save register edit locally</Text>
                                </Pressable>
                                <Pressable onPress={() => confirmVoidRegisterEntry(entry)} style={styles.dangerButton}>
                                  <Text style={styles.dangerButtonText}>Void line locally</Text>
                                </Pressable>
                              </View>
                            </>
                          ) : null}
                        </View>
                      );
                    })
                  )}

                  {(() => {
                    const createDraft = registerCreateDrafts[job.id] ?? createRegisterEntryDraft();

                    return (
                      <View style={styles.reviewCard}>
                        <Text style={styles.sectionTitleSmall}>Add register line</Text>
                        <View style={styles.actionRow}>
                          {registerEntryKinds.map((entryKind) => (
                            <Pressable
                              key={entryKind}
                              onPress={() => updateRegisterCreateDraft(job.id, { registerEntryKind: entryKind })}
                              style={styles.tagButton}
                            >
                              <Text style={styles.tagButtonText}>{formatRegisterEntryKind(entryKind)}</Text>
                            </Pressable>
                          ))}
                        </View>
                        {job.appointments.length > 0 ? (
                          <View style={styles.actionRow}>
                            <Pressable
                              onPress={() => updateRegisterCreateDraft(job.id, { appointmentId: '' })}
                              style={styles.tagButton}
                            >
                              <Text style={styles.tagButtonText}>Job-level</Text>
                            </Pressable>
                            {job.appointments.map((appointment) => (
                              <Pressable
                                key={appointment.id}
                                onPress={() => updateRegisterCreateDraft(job.id, { appointmentId: appointment.id })}
                                style={styles.tagButton}
                              >
                                <Text style={styles.tagButtonText}>{formatAppointmentSchedule(appointment)}</Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                        <TextInput
                          value={createDraft.description}
                          onChangeText={(value) => updateRegisterCreateDraft(job.id, { description: value })}
                          placeholder="Description"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.quantity}
                          onChangeText={(value) => updateRegisterCreateDraft(job.id, { quantity: value })}
                          keyboardType="decimal-pad"
                          placeholder="Quantity"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.unitOfMeasure}
                          onChangeText={(value) => updateRegisterCreateDraft(job.id, { unitOfMeasure: value })}
                          placeholder="Unit"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.unitPrice}
                          onChangeText={(value) => updateRegisterCreateDraft(job.id, { unitPrice: value })}
                          keyboardType="decimal-pad"
                          placeholder="Unit price"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.totalAmount}
                          onChangeText={(value) => updateRegisterCreateDraft(job.id, { totalAmount: value })}
                          keyboardType="decimal-pad"
                          placeholder="Total amount"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.partNumber}
                          onChangeText={(value) => updateRegisterCreateDraft(job.id, { partNumber: value })}
                          placeholder="Part number"
                          style={styles.input}
                        />
                        <TextInput
                          value={createDraft.inventorySourceLabel}
                          onChangeText={(value) => updateRegisterCreateDraft(job.id, { inventorySourceLabel: value })}
                          placeholder="Source label"
                          style={styles.input}
                        />
                        <Pressable onPress={() => void queueRegisterEntryCreate(job)} style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>Save register line locally</Text>
                        </Pressable>
                      </View>
                    );
                  })()}
                </View> : null}

                {activeDetailTab === 'sync' ? (
                  <View style={styles.block}>
                    <Text style={styles.sectionTitleSmall}>Queued work for this job</Text>
                    {getPendingOperationsForJob(job, equipment, pendingOperations).length === 0 ? (
                      <Text style={styles.summaryText}>No local changes waiting for this job.</Text>
                    ) : (
                      getPendingOperationsForJob(job, equipment, pendingOperations).map((operation) => (
                        <View key={operation.id} style={styles.queueItem}>
                          <Text style={styles.summaryText}>{formatPendingOperation(operation)}</Text>
                          {shouldOfferQueueResolution(operation) ? (
                            <View style={styles.actionRow}>
                              <Pressable onPress={() => void retryQueuedOperation(operation.id)} style={styles.secondaryButton}>
                                <Text style={styles.secondaryButtonText}>Retry on next sync</Text>
                              </Pressable>
                              <Pressable onPress={() => confirmDiscardQueuedOperation(operation)} style={styles.dangerButton}>
                                <Text style={styles.dangerButtonText}>Discard local change</Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ))
                    )}
                    <Text style={styles.summaryText}>
                      Last successful sync: {syncMetadata.lastSuccessfulSyncAt ?? 'Not synced yet'}
                    </Text>
                  </View>
                ) : null}

                {activeDetailTab === 'equipment' ? equipment.map((record) => (
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
                )) : null}

                {activeDetailTab === 'equipment' ? <View style={styles.block}>
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
                </View> : null}
              </View>
            );
          })}

          {!selectedJob ? <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Pending queue</Text>
            {pendingOperations.length === 0 ? (
              <Text style={styles.summaryText}>No local changes waiting for sync.</Text>
            ) : (
              pendingOperations.map((operation) => (
                <View key={operation.id} style={styles.queueItem}>
                  <Text style={styles.summaryText}>{formatPendingOperation(operation)}</Text>
                  {shouldOfferQueueResolution(operation) ? (
                    <View style={styles.actionRow}>
                      <Pressable onPress={() => void retryQueuedOperation(operation.id)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Retry on next sync</Text>
                      </Pressable>
                      <Pressable onPress={() => confirmDiscardQueuedOperation(operation)} style={styles.dangerButton}>
                        <Text style={styles.dangerButtonText}>Discard local change</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View> : null}
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

function createRegisterEntryDraft(
  entry?: Partial<NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number]>
): RegisterEntryDraft {
  return {
    appointmentId: entry?.appointmentId ?? '',
    registerEntryKind: entry?.kind ?? 'part',
    description: entry?.description ?? '',
    quantity: entry?.quantity !== undefined ? String(entry.quantity) : '1',
    unitOfMeasure: entry?.unitOfMeasure ?? 'each',
    unitPrice: entry?.unitPrice !== undefined ? String(entry.unitPrice) : '',
    totalAmount: entry?.totalAmount !== undefined ? String(entry.totalAmount) : '',
    partNumber: entry?.partNumber ?? '',
    inventorySourceLabel: entry?.inventorySourceLabel ?? ''
  };
}

function parseRegisterEntryDraft(
  draft: RegisterEntryDraft,
  allowClearedUnitPrice: boolean
):
  | {
      ok: true;
      value: {
        description: string;
        quantity: number;
        unitOfMeasure?: string;
        unitPrice?: number | null;
        totalAmount: number;
        partNumber?: string;
        inventorySourceLabel?: string;
      };
    }
  | { ok: false; message: string } {
  const description = draft.description.trim();
  const quantity = Number(draft.quantity);
  const unitPrice = draft.unitPrice.trim() ? Number(draft.unitPrice) : allowClearedUnitPrice ? null : undefined;
  const totalAmount = Number(draft.totalAmount);

  if (!description) {
    return { ok: false, message: 'Register entry description is required.' };
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, message: 'Register entry quantity must be greater than zero.' };
  }

  if (unitPrice !== undefined && unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
    return { ok: false, message: 'Register entry unit price cannot be negative.' };
  }

  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    return { ok: false, message: 'Register entry total amount cannot be negative.' };
  }

  return {
    ok: true,
    value: {
      description,
      quantity,
      unitOfMeasure: draft.unitOfMeasure.trim() || undefined,
      unitPrice,
      totalAmount,
      partNumber: draft.partNumber.trim() || undefined,
      inventorySourceLabel: draft.inventorySourceLabel.trim() || undefined
    }
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

function formatRegisterEntryKind(kind: RegisterEntryKind): string {
  if (kind === 'serviceItem') {
    return 'Service item';
  }

  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function isLocalRegisterEntry(
  entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number]
): boolean {
  return entry.capturedByEmployeeId === 'local-device' || entry.id.endsWith('-local');
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
  jobHomeCard: {
    backgroundColor: '#ffffff',
    borderColor: '#ebdec6',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 16
  },
  jobHomeHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  detailHeaderRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  flexColumn: { flex: 1, gap: 4 },
  noticeCard: { backgroundColor: '#eef6f7', borderColor: '#bdd9df', borderRadius: 18, borderWidth: 1, gap: 8, padding: 16 },
  block: { backgroundColor: '#faf7ef', borderRadius: 14, gap: 8, padding: 12 },
  queueItem: { borderColor: '#ebdec6', borderTopWidth: 1, gap: 8, paddingTop: 10 },
  reviewCard: { backgroundColor: '#f3f7ef', borderColor: '#d5e2cd', borderRadius: 14, borderWidth: 1, gap: 8, padding: 12 },
  queueBadge: {
    borderRadius: 999,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  queueBadgeAlert: { backgroundColor: '#fdecea', color: '#9f1d15' },
  queueBadgeAttention: { backgroundColor: '#fff7e1', color: '#8a5a00' },
  queueBadgeQuiet: { backgroundColor: '#e8f3ed', color: '#1c6b57' },
  segmentedControl: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segmentButton: {
    borderColor: '#cdbfa6',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  segmentButtonActive: { backgroundColor: '#1c6b57', borderColor: '#1c6b57' },
  segmentButtonText: { color: '#1f2933', fontSize: 13, fontWeight: '700' },
  segmentButtonTextActive: { color: '#ffffff' },
  sectionTitle: { color: '#1f2933', fontSize: 17, fontWeight: '600' },
  sectionTitleSmall: { color: '#1f2933', fontSize: 15, fontWeight: '600' },
  summaryText: { color: '#52606d', fontSize: 14, lineHeight: 20 },
  pendingText: { color: '#8a5a00', fontSize: 14, fontWeight: '600', lineHeight: 20 },
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
  dangerButton: { alignItems: 'center', borderColor: '#d79b92', borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  dangerButtonText: { color: '#9f1d15', fontSize: 14, fontWeight: '700' },
  tagButton: { backgroundColor: '#eef2e5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  tagButtonText: { color: '#33523d', fontSize: 13, fontWeight: '600' },
  errorText: { color: '#b42318', fontSize: 14 }
});
