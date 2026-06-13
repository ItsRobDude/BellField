import { Text } from 'react-native';
import type { BellFieldMessageKey, BellFieldTranslator } from '@bellfield/i18n';
import type { FieldDetailTab, JobQueueBadge } from './field-workspace-layout';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';

const fieldDetailTabLabelKeys = {
  overview: 'fieldWorkspace.detailTabs.overview',
  appointments: 'fieldWorkspace.detailTabs.appointments',
  register: 'fieldWorkspace.detailTabs.register',
  equipment: 'fieldWorkspace.detailTabs.equipment',
  sync: 'fieldWorkspace.detailTabs.sync'
} satisfies Record<FieldDetailTab, BellFieldMessageKey>;

export function formatFieldDetailTabLabel(tab: FieldDetailTab, t: BellFieldTranslator): string {
  return t(fieldDetailTabLabelKeys[tab]);
}

export function formatQueueBadgeLabel(queueBadge: JobQueueBadge, t: BellFieldTranslator): string {
  if (queueBadge.tone === 'quiet') {
    return t('fieldWorkspace.syncSynced');
  }

  if (queueBadge.tone === 'attention') {
    return `${queueBadge.count} ${t('fieldWorkspace.syncQueued')}`;
  }

  const reviewKey =
    queueBadge.count === 1
      ? 'fieldWorkspace.syncNeedsReviewSingular'
      : 'fieldWorkspace.syncNeedsReviewPlural';
  return `${queueBadge.count} ${t(reviewKey)}`;
}

export function QueueBadge({
  label,
  tone
}: {
  label: string;
  tone: 'quiet' | 'attention' | 'alert';
}) {
  return (
    <Text
      style={[
        styles.queueBadge,
        tone === 'alert'
          ? styles.queueBadgeAlert
          : tone === 'attention'
            ? styles.queueBadgeAttention
            : styles.queueBadgeQuiet
      ]}
    >
      {label}
    </Text>
  );
}
