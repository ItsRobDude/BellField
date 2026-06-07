'use client';

import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmPanelHeaderProps = {
  isRefreshing: boolean;
  onRefresh: () => void;
};

export function CrmPanelHeader({ isRefreshing, onRefresh }: CrmPanelHeaderProps) {
  return (
    <div style={styles.row}>
      <div>
        <h2 style={styles.heading}>Customers</h2>
        <p style={styles.muted}>Search, review, and maintain customer records.</p>
      </div>
      <button type="button" onClick={onRefresh} style={styles.button}>
        {isRefreshing ? 'Refreshing...' : 'Refresh customers'}
      </button>
    </div>
  );
}
