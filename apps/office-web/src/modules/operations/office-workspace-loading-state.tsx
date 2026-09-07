'use client';

import type { EmployeeSummary } from '@/lib/identity-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type OfficeWorkspaceLoadingStateProps = {
  employee: EmployeeSummary;
  errorMessage: string | null;
  isDispatchRefreshing: boolean;
  onRetry: () => void;
};

// The first screen after sign-in while the dispatch board loads. If that first load fails
// (server restarting, network blip), the user gets the reason and a way to try again
// instead of a dead end.
export function OfficeWorkspaceLoadingState({
  employee,
  errorMessage,
  isDispatchRefreshing,
  onRetry
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
        {errorMessage && !isDispatchRefreshing ? (
          <button type="button" style={styles.button} onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </section>
    </main>
  );
}
