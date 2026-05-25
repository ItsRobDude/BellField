import { Pressable, Text, View } from 'react-native';
import { formatPendingOperation } from './field-pending-replay';
import { shouldOfferQueueResolution } from './field-queue-resolution';
import type { PendingOperation } from './field-sync-types';
import { getPendingOperationsForJob } from './field-workspace-layout';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';
import type { FieldEquipmentRecord, FieldJob } from './field-workspace-types';

type JobSyncTabProps = {
  equipment: FieldEquipmentRecord[];
  job: FieldJob;
  pendingOperations: PendingOperation[];
  syncLastSuccessfulAt: string | null;
  onConfirmDiscardQueuedOperation: (operation: PendingOperation) => void;
  onRetryQueuedOperation: (operationId: string) => void;
};

export function JobSyncTab({
  equipment,
  job,
  pendingOperations,
  syncLastSuccessfulAt,
  onConfirmDiscardQueuedOperation,
  onRetryQueuedOperation
}: JobSyncTabProps) {
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
