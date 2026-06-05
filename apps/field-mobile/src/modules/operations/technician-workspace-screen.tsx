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
import { getAssignedFieldWork, getFieldTruckStock } from '@/lib/operations-api';
import type { EmployeeSummary } from '@/lib/identity-api';
import {
  initializeFieldSyncStore,
  loadAssignedWorkSnapshot,
  loadPendingOperations,
  loadSyncMetadata,
  loadTruckStockSnapshot,
  saveAssignedWorkSnapshot,
  saveSyncMetadata,
  saveTruckStockSnapshot
} from './field-sync-store';
import type {
  AssignedWorkSnapshot,
  PendingOperation,
  SyncMetadata,
  TruckStockSnapshot
} from './field-sync-types';
import { applyPendingOperations } from './field-pending-replay';
import { drainFieldSyncQueue } from './field-sync-drain';
import { createFieldOperationHandlers } from './field-operation-handlers';
import { buildSuccessfulSyncMetadata, summarizeSyncHealth } from './field-sync-status';
import { summarizeOfficeAppointmentChanges } from './field-appointment-display';
import { getReplayablePendingOperations } from './field-queue-resolution';
import {
  nextBackgroundSyncDelayMs,
  shouldRunBackgroundSync
} from './field-background-sync-schedule';
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

/**
 * Refresh + persist the technician's truck-stock snapshot and apply it to state so the part
 * picker can offer structured stock. Non-fatal: a technician with no assigned truck (or a
 * transient failure) keeps any cached snapshot and can still capture free-text parts, so this
 * never surfaces an error or blocks assigned-work loading.
 */
async function syncTruckStock(
  input: { sessionToken: string; apiBaseUrl: string },
  apply: (snapshot: TruckStockSnapshot) => void
): Promise<void> {
  try {
    const snapshot = await getFieldTruckStock(input);
    await saveTruckStockSnapshot(snapshot);
    apply(snapshot);
  } catch {
    // Swallowed by design — see the doc comment above.
  }
}

export function TechnicianWorkspaceScreen({
  apiBaseUrl,
  employee,
  sessionToken,
  onSignOut
}: Props) {
  const safeAreaInsets = useSafeAreaInsets();
  const [serverSnapshot, setServerSnapshot] = useState<AssignedWorkSnapshot | null>(null);
  const [truckStock, setTruckStock] = useState<TruckStockSnapshot | null>(null);
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
        const [persistedSnapshot, persistedOperations, persistedMetadata, persistedTruckStock] =
          await Promise.all([
            loadAssignedWorkSnapshot(),
            loadPendingOperations(),
            loadSyncMetadata(),
            loadTruckStockSnapshot()
          ]);

        setServerSnapshot(persistedSnapshot);
        setPendingOperations(persistedOperations);
        setSyncMetadata(persistedMetadata);
        setTruckStock(persistedTruckStock);
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
        await syncTruckStock({ sessionToken, apiBaseUrl }, setTruckStock);
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
      await syncTruckStock({ sessionToken, apiBaseUrl }, setTruckStock);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh assigned work.');
    } finally {
      if (showSpinner) {
        setIsRefreshing(false);
      }
    }
  }

  // Offline-queue handlers live in field-operation-handlers.ts; the screen owns the state
  // they close over and hands it in. Destructured into the same names the render already uses.
  const {
    queueJobNote,
    queueMediaUpload,
    queueRegisterEntryCreate,
    queueRegisterEntryEdit,
    confirmVoidRegisterEntry,
    queueAppointmentStatus,
    queueAppointmentFinishReview,
    queueEquipmentUpdate,
    createEquipmentAtLocation,
    linkReplacement,
    retryQueuedOperation,
    confirmDiscardQueuedOperation
  } = createFieldOperationHandlers({
    sessionToken,
    apiBaseUrl,
    serverSnapshot,
    setPendingOperations,
    setErrorMessage,
    refreshAssignedWork
  });

  function openJobDetail(jobId: string) {
    setSelectedJobId(jobId);
    setActiveDetailTab('overview');
    setActiveWorkspaceTab('jobs');
  }

  function returnToHome() {
    setSelectedJobId(null);
    setActiveDetailTab('overview');
  }

  // Thin wrapper around the extracted drain engine (field-sync-drain.ts): hands it the
  // current state snapshot plus the setters it writes through. syncNow and the background
  // loop keep owning the mutex and spinner state.
  async function runSyncDrain(options: { visible: boolean }): Promise<{ ok: boolean }> {
    return drainFieldSyncQueue(
      {
        sessionToken,
        apiBaseUrl,
        syncMetadata,
        pendingOperations,
        setServerSnapshot,
        setSyncMetadata,
        setPendingOperations,
        setErrorMessage
      },
      options
    );
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
              truckStockItems={truckStock?.items ?? []}
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
