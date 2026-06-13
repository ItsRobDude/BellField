import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  createBellFieldTranslator,
  type BellFieldLocale,
  type BellFieldTranslator,
  type BellFieldMessageKey
} from '@bellfield/i18n';
import type { EmployeeSummary } from '@/lib/identity-api';
import type { FieldAssignedWorkResponse } from '@/lib/operations-api';
import { formatPendingOperation } from './field-pending-replay';
import { shouldOfferQueueResolution } from './field-queue-resolution';
import type { PendingOperation, SyncMetadata } from './field-sync-types';
import type { SyncHealthSummary, SyncTone } from './field-sync-status';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';

export type FieldWorkspaceTab = 'jobs' | 'messages' | 'sync' | 'settings';

const fieldWorkspaceTabs: FieldWorkspaceTab[] = ['jobs', 'messages', 'sync', 'settings'];

const fieldWorkspaceTabLabelKeys = {
  jobs: 'fieldWorkspace.tabJobs',
  messages: 'fieldWorkspace.tabMessages',
  sync: 'fieldWorkspace.tabSync',
  settings: 'fieldWorkspace.tabSettings'
} satisfies Record<FieldWorkspaceTab, BellFieldMessageKey>;

const fallbackSyncLocales: Record<BellFieldLocale, string> = {
  en: 'en-US',
  es: 'es-US'
};

type LocaleProps = {
  locale: BellFieldLocale;
};

type TranslatorProps = {
  t: BellFieldTranslator;
};

type SyncDisplayProps = LocaleProps & TranslatorProps;

type SyncHeadlineParts = {
  count: number;
  pluralKey: BellFieldMessageKey;
  singularKey: BellFieldMessageKey;
};

const syncConflictKeys = {
  pluralKey: 'fieldWorkspace.syncConflictPlural',
  singularKey: 'fieldWorkspace.syncConflictSingular'
} satisfies Omit<SyncHeadlineParts, 'count'>;

const syncRejectedKeys = {
  pluralKey: 'fieldWorkspace.syncRejectedItemPlural',
  singularKey: 'fieldWorkspace.syncRejectedItemSingular'
} satisfies Omit<SyncHeadlineParts, 'count'>;

type FieldWorkspaceHeaderProps = LocaleProps & {
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
  locale,
  showSyncSummary,
  syncHealth,
  syncMetadata,
  onRefresh,
  onSignOut,
  onSyncNow
}: FieldWorkspaceHeaderProps) {
  const t = createBellFieldTranslator(locale);

  return (
    <>
      <Text style={styles.kicker}>{t('fieldAuth.productName')}</Text>
      <Text style={styles.title}>{employee.displayName}</Text>
      <Text style={styles.subtitle}>{t('fieldWorkspace.productIntro')}</Text>

      {showSyncSummary ? (
        <>
          <FieldSyncSummaryCard
            assignedWork={assignedWork}
            locale={locale}
            showQuietDetail
            syncHealth={syncHealth}
            syncMetadata={syncMetadata}
            t={t}
          />
          <FieldWorkspaceActions
            isRefreshing={isRefreshing}
            isSyncing={isSyncing}
            onRefresh={onRefresh}
            onSignOut={onSignOut}
            onSyncNow={onSyncNow}
            showSignOut
            t={t}
          />
        </>
      ) : null}
    </>
  );
}

type FieldSyncSurfaceProps = LocaleProps & {
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
  locale,
  pendingOperations,
  syncHealth,
  syncMetadata,
  onDiscardQueuedOperation,
  onRefresh,
  onRetryQueuedOperation,
  onSyncNow
}: FieldSyncSurfaceProps) {
  const t = createBellFieldTranslator(locale);

  return (
    <>
      <FieldSyncSummaryCard
        assignedWork={assignedWork}
        locale={locale}
        syncHealth={syncHealth}
        syncMetadata={syncMetadata}
        t={t}
      >
        <FieldWorkspaceActions
          isRefreshing={isRefreshing}
          isSyncing={isSyncing}
          onRefresh={onRefresh}
          onSyncNow={onSyncNow}
          t={t}
        />
      </FieldSyncSummaryCard>
      <FieldPendingQueue
        onDiscardQueuedOperation={onDiscardQueuedOperation}
        onRetryQueuedOperation={onRetryQueuedOperation}
        pendingOperations={pendingOperations}
        t={t}
      />
    </>
  );
}

type FieldSyncSummaryCardProps = SyncDisplayProps & {
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
  syncMetadata,
  t,
  locale
}: FieldSyncSummaryCardProps) {
  const syncHeadline = formatSyncHealthHeadline(syncHealth, t);
  const syncDetail = formatSyncHealthDetail(syncHealth, t);

  return (
    <View
      accessibilityLabel={`${t('fieldWorkspace.syncStatusAccessibility')}: ${syncHeadline}`}
      style={[styles.summaryCard, getSyncHealthCardStyle(syncHealth.tone)]}
    >
      <Text style={styles.sectionTitle}>{syncHeadline}</Text>
      {syncDetail ? <Text style={styles.summaryText}>{syncDetail}</Text> : null}
      {showQuietDetail && syncHealth.tone === 'quiet' ? (
        <Text style={styles.summaryText}>{t('fieldWorkspace.syncBackgroundHealthy')}</Text>
      ) : null}
      <Text style={styles.summaryText}>
        {t('fieldWorkspace.syncWorkWindow')}: {formatWorkWindow(assignedWork, locale, t)}
      </Text>
      <Text style={styles.summaryText}>
        {t('fieldWorkspace.syncLastSync')}:{' '}
        {formatLastSync(syncMetadata.lastSuccessfulSyncAt, locale, t)}
      </Text>
      {children}
    </View>
  );
}

type FieldWorkspaceActionsProps = TranslatorProps & {
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
  t,
  onRefresh,
  onSignOut,
  onSyncNow
}: FieldWorkspaceActionsProps) {
  return (
    <View style={styles.actionRow}>
      <Pressable onPress={onRefresh} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>
          {isRefreshing
            ? t('fieldWorkspace.actions.refreshing')
            : t('fieldWorkspace.actions.refreshJobs')}
        </Text>
      </Pressable>
      <Pressable onPress={onSyncNow} style={styles.primaryButton}>
        {isSyncing ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>{t('fieldWorkspace.actions.syncNow')}</Text>
        )}
      </Pressable>
      {showSignOut && onSignOut ? (
        <Pressable onPress={onSignOut} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('fieldWorkspace.actions.signOut')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type FieldPendingQueueProps = TranslatorProps & {
  pendingOperations: PendingOperation[];
  onDiscardQueuedOperation: (operation: PendingOperation) => void;
  onRetryQueuedOperation: (operationId: string) => void;
};

function FieldPendingQueue({
  pendingOperations,
  t,
  onDiscardQueuedOperation,
  onRetryQueuedOperation
}: FieldPendingQueueProps) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.sectionTitle}>{t('fieldWorkspace.pendingQueueTitle')}</Text>
      {pendingOperations.length === 0 ? (
        <Text style={styles.summaryText}>{t('fieldWorkspace.pendingQueueEmpty')}</Text>
      ) : (
        pendingOperations.map((operation) => (
          <View key={operation.id} style={styles.queueItem}>
            <Text style={styles.summaryText}>{formatPendingOperation(operation, t)}</Text>
            {shouldOfferQueueResolution(operation) ? (
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => onRetryQueuedOperation(operation.id)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>
                    {t('fieldWorkspace.actions.retryOnNextSync')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onDiscardQueuedOperation(operation)}
                  style={styles.dangerButton}
                >
                  <Text style={styles.dangerButtonText}>
                    {t('fieldWorkspace.actions.discardLocalChange')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

export function FieldOfficeChangeNotice({
  locale,
  messages
}: LocaleProps & { messages: string[] }) {
  if (messages.length === 0) {
    return null;
  }

  const t = createBellFieldTranslator(locale);

  return (
    <View style={styles.noticeCard}>
      <Text style={styles.sectionTitle}>{t('fieldWorkspace.officeChangedTitle')}</Text>
      {messages.slice(0, 3).map((message) => (
        <Text key={message} style={styles.summaryText}>
          {message}
        </Text>
      ))}
      {messages.length > 3 ? (
        <Text style={styles.summaryText}>
          {messages.length - 3}{' '}
          {t(
            messages.length - 3 === 1
              ? 'fieldWorkspace.officeChangeMoreSingular'
              : 'fieldWorkspace.officeChangeMorePlural'
          )}
        </Text>
      ) : null}
    </View>
  );
}

export function FieldNoAssignedJobsCard({ locale }: LocaleProps) {
  const t = createBellFieldTranslator(locale);

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.sectionTitle}>{t('fieldWorkspace.noAssignedJobsTitle')}</Text>
      <Text style={styles.summaryText}>{t('fieldWorkspace.noAssignedJobsBody')}</Text>
    </View>
  );
}

export function FieldUnavailableSurface({
  kind,
  locale
}: LocaleProps & { kind: 'messages' | 'settings' }) {
  const t = createBellFieldTranslator(locale);

  if (kind === 'messages') {
    return (
      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>{t('fieldWorkspace.messagesUnavailableTitle')}</Text>
        <Text style={styles.summaryText}>{t('fieldWorkspace.messagesUnavailableBody')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.sectionTitle}>{t('fieldWorkspace.settingsUnavailableTitle')}</Text>
      <Text style={styles.summaryText}>{t('fieldWorkspace.settingsUnavailableBody')}</Text>
    </View>
  );
}

export function FieldWorkspaceBottomNav({
  activeTab,
  locale,
  safeAreaBottom,
  onChangeTab
}: {
  activeTab: FieldWorkspaceTab;
  locale: BellFieldLocale;
  safeAreaBottom: number;
  onChangeTab: (tab: FieldWorkspaceTab) => void;
}) {
  const t = createBellFieldTranslator(locale);

  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(12, safeAreaBottom + 8) }]}>
      {fieldWorkspaceTabs.map((tab) => {
        const isActive = activeTab === tab;

        return (
          <Pressable
            key={tab}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChangeTab(tab)}
            style={[styles.bottomNavButton, isActive ? styles.bottomNavButtonActive : null]}
          >
            <Text style={[styles.bottomNavText, isActive ? styles.bottomNavTextActive : null]}>
              {t(fieldWorkspaceTabLabelKeys[tab])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatSyncHealthHeadline(syncHealth: SyncHealthSummary, t: BellFieldTranslator): string {
  if (syncHealth.hasLastSyncError) {
    return t('fieldWorkspace.syncFailedHeadline');
  }

  if (syncHealth.conflictCount > 0 || syncHealth.rejectedCount > 0) {
    return formatReviewHeadline(syncHealth.conflictCount, syncHealth.rejectedCount, t);
  }

  if (syncHealth.pendingCount > 0) {
    const countKey =
      syncHealth.pendingCount === 1
        ? 'fieldWorkspace.syncChangeWaitingSingular'
        : 'fieldWorkspace.syncChangeWaitingPlural';
    return `${syncHealth.pendingCount} ${t(countKey)}`;
  }

  if (syncHealth.tone === 'alert') {
    return t('fieldWorkspace.syncNotSyncedYet');
  }

  return t('fieldWorkspace.syncSynced');
}

function formatSyncHealthDetail(
  syncHealth: SyncHealthSummary,
  t: BellFieldTranslator
): string | undefined {
  if (syncHealth.hasLastSyncError) {
    return syncHealth.detail;
  }

  if (
    syncHealth.tone === 'alert' &&
    syncHealth.conflictCount === 0 &&
    syncHealth.rejectedCount === 0
  ) {
    return t('fieldWorkspace.syncNeedsServerProtection');
  }

  return undefined;
}

function formatReviewHeadline(
  conflictCount: number,
  rejectedCount: number,
  t: BellFieldTranslator
): string {
  const parts: string[] = [];

  if (conflictCount > 0) {
    parts.push(formatCountPart(conflictCount, { count: conflictCount, ...syncConflictKeys }, t));
  }

  if (rejectedCount > 0) {
    parts.push(formatCountPart(rejectedCount, { count: rejectedCount, ...syncRejectedKeys }, t));
  }

  const totalCount = conflictCount + rejectedCount;
  const reviewKey =
    totalCount === 1
      ? 'fieldWorkspace.syncNeedsReviewSingular'
      : 'fieldWorkspace.syncNeedsReviewPlural';

  return `${parts.join(` ${t('common.and')} `)} ${t(reviewKey)}`;
}

function formatCountPart(count: number, part: SyncHeadlineParts, t: BellFieldTranslator): string {
  return `${count} ${t(count === 1 ? part.singularKey : part.pluralKey)}`;
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

function formatWorkWindow(
  assignedWork: FieldAssignedWorkResponse | null,
  locale: BellFieldLocale,
  t: BellFieldTranslator
): string {
  if (!assignedWork) {
    return t('fieldWorkspace.todayAndTomorrow');
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
    return t('fieldWorkspace.todayAndTomorrow');
  }

  if (assignedWork.windowStartDate === assignedWork.windowEndDate) {
    return formatDateLabel(assignedWork.windowStartDate, locale);
  }

  return `${formatDateLabel(assignedWork.windowStartDate, locale)} ${t(
    'common.to'
  )} ${formatDateLabel(assignedWork.windowEndDate, locale)}`;
}

function formatLastSync(
  value: string | null,
  locale: BellFieldLocale,
  t: BellFieldTranslator
): string {
  if (!value) {
    return t('fieldWorkspace.syncNotSyncedYet');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t('fieldWorkspace.syncNotSyncedYet');
  }

  return new Intl.DateTimeFormat(fallbackSyncLocales[locale], {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

function formatDateLabel(value: string, locale: BellFieldLocale): string {
  const date = parseLocalDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(fallbackSyncLocales[locale], {
    month: 'short',
    day: 'numeric'
  }).format(date);
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
