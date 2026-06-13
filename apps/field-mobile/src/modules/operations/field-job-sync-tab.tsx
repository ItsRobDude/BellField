import { Pressable, Text, View } from 'react-native';
import { createBellFieldTranslator, type BellFieldLocale } from '@bellfield/i18n';
import { formatPendingOperation } from './field-pending-replay';
import { shouldOfferQueueResolution } from './field-queue-resolution';
import type { PendingOperation } from './field-sync-types';
import { getPendingOperationsForJob } from './field-workspace-layout';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';
import type { FieldEquipmentRecord, FieldJob } from './field-workspace-types';

type JobSyncTabProps = {
  equipment: FieldEquipmentRecord[];
  job: FieldJob;
  locale: BellFieldLocale;
  pendingOperations: PendingOperation[];
  syncLastSuccessfulAt: string | null;
  onConfirmDiscardQueuedOperation: (operation: PendingOperation) => void;
  onRetryQueuedOperation: (operationId: string) => void;
};

export function JobSyncTab({
  equipment,
  job,
  locale,
  pendingOperations,
  syncLastSuccessfulAt,
  onConfirmDiscardQueuedOperation,
  onRetryQueuedOperation
}: JobSyncTabProps) {
  const t = createBellFieldTranslator(locale);
  const jobOperations = getPendingOperationsForJob(job, equipment, pendingOperations);

  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitleSmall}>{t('fieldWorkspace.syncQueuedJobTitle')}</Text>
      {jobOperations.length === 0 ? (
        <Text style={styles.summaryText}>{t('fieldWorkspace.syncQueuedJobEmpty')}</Text>
      ) : (
        jobOperations.map((operation) => (
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
                  onPress={() => onConfirmDiscardQueuedOperation(operation)}
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
      <Text style={styles.summaryText}>
        {t('fieldWorkspace.syncLastSuccessful')}:{' '}
        {syncLastSuccessfulAt ?? t('fieldWorkspace.syncNotSyncedYet')}
      </Text>
    </View>
  );
}
