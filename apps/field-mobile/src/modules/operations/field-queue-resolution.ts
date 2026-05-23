import type { PendingOperation } from './field-sync-types';

export function shouldOfferQueueResolution(operation: PendingOperation): boolean {
  return operation.state === 'conflict' || operation.state === 'rejected';
}

export function getReplayablePendingOperations(pendingOperations: PendingOperation[]): PendingOperation[] {
  return pendingOperations
    .filter((operation) => operation.state === 'pending')
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

export function markPendingOperationForRetry(
  pendingOperations: PendingOperation[],
  operationId: string
): PendingOperation[] {
  return pendingOperations.map((operation) =>
    operation.id === operationId ? { ...operation, state: 'pending', lastResultMessage: undefined } : operation
  );
}

export function discardPendingOperation(
  pendingOperations: PendingOperation[],
  operationId: string
): PendingOperation[] {
  return pendingOperations.filter((operation) => operation.id !== operationId);
}
