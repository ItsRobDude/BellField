'use client';

import type { LocationDetail } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type RecordActivitySectionProps = {
  ownershipHistory: LocationDetail['ownershipHistory'];
};

export function RecordActivitySection({ ownershipHistory }: RecordActivitySectionProps) {
  return (
    <div style={styles.subpanel}>
      <strong>Ownership history</strong>
      {ownershipHistory.length > 0 ? (
        ownershipHistory.map((entry) => (
          <div key={entry.id} style={styles.tinyMuted}>
            {entry.customerName}: {entry.startedAt.slice(0, 10)}
            {entry.endedAt ? ` to ${entry.endedAt.slice(0, 10)}` : ' to present'}
            {entry.note ? ` - ${entry.note}` : ''}
          </div>
        ))
      ) : (
        <p style={styles.muted}>No ownership history yet.</p>
      )}
    </div>
  );
}
