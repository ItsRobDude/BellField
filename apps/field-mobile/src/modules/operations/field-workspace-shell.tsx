import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { EmployeeSummary } from '@/lib/identity-api';
import type { FieldAssignedWorkResponse } from '@/lib/operations-api';
import { formatPendingOperation } from './field-pending-replay';
import { shouldOfferQueueResolution } from './field-queue-resolution';
import type { PendingOperation, SyncMetadata } from './field-sync-types';
import type { SyncHealthSummary, SyncTone } from './field-sync-status';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';

export type FieldWorkspaceTab = 'jobs' | 'messages' | 'sync' | 'settings';

const fieldWorkspaceTabs: { id: FieldWorkspaceTab; label: string }[] = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'messages', label: 'Messages' },
  { id: 'sync', label: 'Sync' },
  { id: 'settings', label: 'Settings' }
];

type FieldWorkspaceHeaderProps = {
  assignedWork: FieldAssignedWorkResponse | null;
  employee: EmployeeSummary;
  isRefreshing: boolean;
  isSyncing: boolean;
  showSyncSummary: boolean;
  syncHealth: SyncHealthSummary;
  syncMetadata: SyncMetadata;
  onRefresh: () => void;
  onSignOut: () => void;
  onSyncNow: () => void;
};

export function FieldWorkspaceHeader({
  assignedWork,
  employee,
  isRefreshing,
  isSyncing,
  showSyncSummary,
  syncHealth,
  syncMetadata,
  onRefresh,
  onSignOut,
  onSyncNow
}: FieldWorkspaceHeaderProps) {
  return (
    <>
      <Text style={styles.kicker}>BellField Field</Text>
      <Text style={styles.title}>{employee.displayName}</Text>
      <Text style={styles.subtitle}>
        Review assigned work, save updates on this device, and sync them back to the office.
      </Text>

      {showSyncSummary ? (
        <>
          <FieldSyncSummaryCard
            assignedWork={assignedWork}
            showQuietDetail
            syncHealth={syncHealth}
            syncMetadata={syncMetadata}
          />
          <FieldWorkspaceActions
            isRefreshing={isRefreshing}
            isSyncing={isSyncing}
            onRefresh={onRefresh}
            onSignOut={onSignOut}
            onSyncNow={onSyncNow}
            showSignOut
          />
        </>
      ) : null}
    </>
  );
}

type FieldSyncSurfaceProps = {
  assignedWork: FieldAssignedWorkResponse | null;
  isRefreshing: boolean;
  isSyncing: boolean;
  pendingOperations: PendingOperation[];
  syncHealth: SyncHealthSummary;
  syncMetadata: SyncMetadata;
  onDiscardQueuedOperation: (operation: PendingOperation) => void;
  onRefresh: () => void;
  onRetryQueuedOperation: (operationId: string) => void;
  onSyncNow: () => void;
};

export function FieldSyncSurface({
  assignedWork,
  isRefreshing,
  isSyncing,
  pendingOperations,
  syncHealth,
  syncMetadata,
  onDiscardQueuedOperation,
  onRefresh,
  onRetryQueuedOperation,
  onSyncNow
}: FieldSyncSurfaceProps) {
  return (
    <>
      <FieldSyncSummaryCard
        assignedWork={assignedWork}
        syncHealth={syncHealth}
        syncMetadata={syncMetadata}
      >
        <FieldWorkspaceActions
          isRefreshing={isRefreshing}
          isSyncing={isSyncing}
          onRefresh={onRefresh}
          onSyncNow={onSyncNow}
        />
      </FieldSyncSummaryCard>
      <FieldPendingQueue
        onDiscardQueuedOperation={onDiscardQueuedOperation}
        onRetryQueuedOperation={onRetryQueuedOperation}
        pendingOperations={pendingOperations}
      />
    </>
  );
}

type FieldSyncSummaryCardProps = {
  assignedWork: FieldAssignedWorkResponse | null;
  children?: ReactNode;
  showQuietDetail?: boolean;
  syncHealth: SyncHealthSummary;
  syncMetadata: SyncMetadata;
};

function FieldSyncSummaryCard({
  assignedWork,
  children,
  showQuietDetail = false,
  syncHealth,
  syncMetadata
}: FieldSyncSummaryCardProps) {
  return (
    <View
      accessibilityLabel={`Sync status: ${syncHealth.headline}`}
      style={[styles.summaryCard, getSyncHealthCardStyle(syncHealth.tone)]}
    >
      <Text style={styles.sectionTitle}>{syncHealth.headline}</Text>
      {syncHealth.detail ? <Text style={styles.summaryText}>{syncHealth.detail}</Text> : null}
      {showQuietDetail && syncHealth.tone === 'quiet' ? (
        <Text style={styles.summaryText}>
          Background sync is healthy. Saved field edits will sync back to the office.
        </Text>
      ) : null}
      <Text style={styles.summaryText}>Work window: {formatWorkWindow(assignedWork)}</Text>
      <Text style={styles.summaryText}>
        Last sync: {formatLastSync(syncMetadata.lastSuccessfulSyncAt)}
      </Text>
      {children}
    </View>
  );
}

type FieldWorkspaceActionsProps = {
  isRefreshing: boolean;
  isSyncing: boolean;
  showSignOut?: boolean;
  onRefresh: () => void;
  onSignOut?: () => void;
  onSyncNow: () => void;
};

function FieldWorkspaceActions({
  isRefreshing,
  isSyncing,
  showSignOut = false,
  onRefresh,
  onSignOut,
  onSyncNow
}: FieldWorkspaceActionsProps) {
  return (
    <View style={styles.actionRow}>
      <Pressable onPress={onRefresh} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>
          {isRefreshing ? 'Refreshing...' : 'Refresh jobs'}
        </Text>
      </Pressable>
      <Pressable onPress={onSyncNow} style={styles.primaryButton}>
        {isSyncing ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>Sync Now</Text>
        )}
      </Pressable>
      {showSignOut && onSignOut ? (
        <Pressable onPress={onSignOut} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type FieldPendingQueueProps = {
  pendingOperations: PendingOperation[];
  onDiscardQueuedOperation: (operation: PendingOperation) => void;
  onRetryQueuedOperation: (operationId: string) => void;
};

function FieldPendingQueue({
  pendingOperations,
  onDiscardQueuedOperation,
  onRetryQueuedOperation
}: FieldPendingQueueProps) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.sectionTitle}>Pending queue</Text>
      {pendingOperations.length === 0 ? (
        <Text style={styles.summaryText}>No local changes waiting for sync.</Text>
      ) : (
        pendingOperations.map((operation) => (
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
                  onPress={() => onDiscardQueuedOperation(operation)}
                  style={styles.dangerButton}
                >
                  <Text style={styles.dangerButtonText}>Discard local change</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

export function FieldOfficeChangeNotice({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <View style={styles.noticeCard}>
      <Text style={styles.sectionTitle}>Office changed this work</Text>
      {messages.slice(0, 3).map((message) => (
        <Text key={message} style={styles.summaryText}>
          {message}
        </Text>
      ))}
      {messages.length > 3 ? (
        <Text style={styles.summaryText}>Plus {messages.length - 3} more office update(s).</Text>
      ) : null}
    </View>
  );
}

export function FieldNoAssignedJobsCard() {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.sectionTitle}>No assigned jobs</Text>
      <Text style={styles.summaryText}>
        Assigned work for today and tomorrow will appear here after the next refresh.
      </Text>
    </View>
  );
}

export function FieldUnavailableSurface({ kind }: { kind: 'messages' | 'settings' }) {
  if (kind === 'messages') {
    return (
      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Messages</Text>
        <Text style={styles.summaryText}>
          Team messaging is not available in this version yet. Job notes and office changes still
          appear inside the assigned work and sync areas.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.sectionTitle}>Settings</Text>
      <Text style={styles.summaryText}>
        Field app settings are not available in this version yet. Use Sign out above if this device
        needs to leave the current technician session.
      </Text>
    </View>
  );
}

export function FieldWorkspaceBottomNav({
  activeTab,
  safeAreaBottom,
  onChangeTab
}: {
  activeTab: FieldWorkspaceTab;
  safeAreaBottom: number;
  onChangeTab: (tab: FieldWorkspaceTab) => void;
}) {
  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(12, safeAreaBottom + 8) }]}>
      {fieldWorkspaceTabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChangeTab(tab.id)}
            style={[styles.bottomNavButton, isActive ? styles.bottomNavButtonActive : null]}
          >
            <Text style={[styles.bottomNavText, isActive ? styles.bottomNavTextActive : null]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function getSyncHealthCardStyle(tone: SyncTone) {
  if (tone === 'alert') {
    return { backgroundColor: '#fdecea', borderColor: '#f1b1ab' };
  }

  if (tone === 'attention') {
    return { backgroundColor: '#fff7e1', borderColor: '#e7d391' };
  }

  return undefined;
}

function formatWorkWindow(assignedWork: FieldAssignedWorkResponse | null): string {
  if (!assignedWork) {
    return 'Today and tomorrow';
  }

  const startDate = parseLocalDate(assignedWork.windowStartDate);
  const endDate = parseLocalDate(assignedWork.windowEndDate);
  const today = new Date();

  if (
    startDate &&
    endDate &&
    isSameLocalDate(startDate, today) &&
    daysBetween(startDate, endDate) === 1
  ) {
    return 'Today and tomorrow';
  }

  if (assignedWork.windowStartDate === assignedWork.windowEndDate) {
    return formatDateLabel(assignedWork.windowStartDate);
  }

  return `${formatDateLabel(assignedWork.windowStartDate)} to ${formatDateLabel(
    assignedWork.windowEndDate
  )}`;
}

function formatLastSync(value: string | null): string {
  if (!value) {
    return 'Not synced yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not synced yet';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

function formatDateLabel(value: string): string {
  const date = parseLocalDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function daysBetween(startDate: Date, endDate: Date): number {
  const millisPerDay = 24 * 60 * 60 * 1000;
  return Math.round((endDate.getTime() - startDate.getTime()) / millisPerDay);
}
