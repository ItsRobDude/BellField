// Cross-record activity/audit read model (M10 slice 2). A read-only union over existing
// timelines/ledgers — no new event-write system. Owner/Admin only (history:view). See
// docs/m10-trust-admin-plan.md §5b.

export type HistoryRecordType =
  | 'jobTimeline'
  | 'registerEntry'
  | 'inventoryMovement'
  | 'jobCostEvent'
  | 'payment'
  | 'equipmentHistory';

/** One unified row in the cross-record history feed. */
export interface HistoryEntry {
  recordType: HistoryRecordType;
  /** The originating row's id within its source table. */
  sourceId: string;
  occurredAt: string;
  /** Null where the source only stored an actor name (job timeline, equipment history). */
  actorEmployeeId: string | null;
  actorName: string | null;
  /** Human-readable line derived server-side from fields already visible to a permitted user. */
  summary: string;
  /** Resolved job (payments resolve theirs via invoice → invoices.job_id); null for equipment. */
  jobId: string | null;
}

export interface HistoryResponse {
  entries: HistoryEntry[];
  /** Opaque cursor for the next page, or null when the feed is exhausted. */
  nextCursor: string | null;
}

/** Query filters for the history feed. All optional; absent means unfiltered on that axis. */
export interface HistoryQuery {
  dateFrom?: string;
  dateTo?: string;
  actorEmployeeId?: string;
  recordType?: HistoryRecordType;
  jobId?: string;
  cursor?: string;
  limit?: number;
}
