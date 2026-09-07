import { useEffect, useRef } from 'react';
import type { CrmNavigationTarget, CrmPanelMode, CrmRecordRef } from './crm-panel-types';

type UseCrmNavigationTargetInput = {
  navigationTarget: CrmNavigationTarget | null;
  /** What the panel shows right now, so a target it already shows is not fetched again. */
  shownRecord: CrmRecordRef | null;
  onNavigationTargetConsumed?: () => void;
  onOpenCustomer: (customerId: string) => Promise<unknown>;
  onOpenLocation: (locationId: string) => Promise<unknown>;
  onReturnToJobChange: (jobId: string | null) => void;
  /** The target went away (browser Back to customer search) while a record was still open. */
  onReturnToSearch: () => void;
};

export function useCrmNavigationTarget({
  navigationTarget,
  shownRecord,
  onNavigationTargetConsumed,
  onOpenCustomer,
  onOpenLocation,
  onReturnToJobChange,
  onReturnToSearch
}: UseCrmNavigationTargetInput) {
  const lastTargetKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!navigationTarget) {
      // Only a target that goes away matters here (browser Back to search, the Customers rail).
      // A panel that never had one keeps its own record open, as in standalone use.
      const wasFollowingTarget = lastTargetKeyRef.current !== null;
      lastTargetKeyRef.current = null;
      if (wasFollowingTarget && shownRecord) {
        onReturnToSearch();
      }
      return;
    }

    const targetKey = `${recordKey(navigationTarget)}:${navigationTarget.returnToJobId ?? ''}`;

    if (lastTargetKeyRef.current === targetKey) {
      return;
    }

    lastTargetKeyRef.current = targetKey;
    onReturnToJobChange(navigationTarget.returnToJobId ?? null);

    if (shownRecord && recordKey(shownRecord) === recordKey(navigationTarget)) {
      onNavigationTargetConsumed?.();
      return;
    }

    const openTarget =
      navigationTarget.kind === 'customer'
        ? onOpenCustomer(navigationTarget.customerId)
        : onOpenLocation(navigationTarget.locationId);

    void openTarget.finally(() => {
      onNavigationTargetConsumed?.();
    });
  }, [
    navigationTarget,
    shownRecord,
    onNavigationTargetConsumed,
    onOpenCustomer,
    onOpenLocation,
    onReturnToJobChange,
    onReturnToSearch
  ]);
}

/** The record a panel in `mode` is showing, if that mode is a customer or location detail. */
export function shownCrmRecord(
  mode: CrmPanelMode,
  customerId: string | null,
  locationId: string | null
): CrmRecordRef | null {
  if (mode === 'customerDetail' && customerId) {
    return { kind: 'customer', customerId };
  }

  if (mode === 'locationDetail' && locationId) {
    return { kind: 'location', locationId };
  }

  return null;
}

function recordKey(record: CrmRecordRef): string {
  return record.kind === 'customer'
    ? `customer:${record.customerId}`
    : `location:${record.locationId}`;
}
