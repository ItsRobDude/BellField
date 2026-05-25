'use client';

import type { EmployeeSummary } from '@/lib/identity-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type OfficeWorkspaceLoadingStateProps = {
  employee: EmployeeSummary;
  errorMessage: string | null;
  isDispatchRefreshing: boolean;
};

export function OfficeWorkspaceLoadingState({
  employee,
  errorMessage,
  isDispatchRefreshing
}: OfficeWorkspaceLoadingStateProps) {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.kicker}>BellField Office</div>
        <h1 style={styles.title}>{employee.displayName}</h1>
        <p style={styles.muted}>
          {isDispatchRefreshing ? 'Loading dispatch...' : 'Dispatch is not ready yet.'}
        </p>
        {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      </section>
    </main>
  );
}
