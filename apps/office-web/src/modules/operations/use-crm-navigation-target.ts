import { useEffect, useRef } from 'react';
import type { CrmNavigationTarget } from './crm-panel-types';

type UseCrmNavigationTargetInput = {
  navigationTarget: CrmNavigationTarget | null;
  onNavigationTargetConsumed?: () => void;
  onOpenCustomer: (customerId: string) => Promise<void>;
  onOpenLocation: (locationId: string) => Promise<void>;
  onReturnToJobChange: (jobId: string | null) => void;
};

export function useCrmNavigationTarget({
  navigationTarget,
  onNavigationTargetConsumed,
  onOpenCustomer,
  onOpenLocation,
  onReturnToJobChange
}: UseCrmNavigationTargetInput) {
  const lastTargetKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!navigationTarget) {
      lastTargetKeyRef.current = null;
      return;
    }

    const targetKey =
      navigationTarget.kind === 'customer'
        ? `${navigationTarget.kind}:${navigationTarget.customerId}:${navigationTarget.returnToJobId ?? ''}`
        : `${navigationTarget.kind}:${navigationTarget.locationId}:${navigationTarget.returnToJobId ?? ''}`;

    if (lastTargetKeyRef.current === targetKey) {
      return;
    }

    lastTargetKeyRef.current = targetKey;
    onReturnToJobChange(navigationTarget.returnToJobId ?? null);

    const openTarget =
      navigationTarget.kind === 'customer'
        ? onOpenCustomer(navigationTarget.customerId)
        : onOpenLocation(navigationTarget.locationId);

    void openTarget.finally(() => {
      onNavigationTargetConsumed?.();
    });
  }, [
    navigationTarget,
    onNavigationTargetConsumed,
    onOpenCustomer,
    onOpenLocation,
    onReturnToJobChange
  ]);
}
