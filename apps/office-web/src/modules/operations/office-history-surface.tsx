'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  getHistory,
  type HistoryEntry,
  type HistoryQuery,
  type HistoryRecordType
} from '@/lib/history-api';
import { getOfficeEmployees, type EmployeeSummary } from '@/lib/identity-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type OfficeHistorySurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  onOpenJob?: (jobId: string) => void;
};

const RECORD_TYPE_LABELS: Record<HistoryRecordType, string> = {
  jobTimeline: 'Job timeline',
  registerEntry: 'Register entry',
  inventoryMovement: 'Inventory',
  jobCostEvent: 'Job cost',
  payment: 'Payment',
  equipmentHistory: 'Equipment'
};

const PAGE_SIZE = 50;

const filterBarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'flex-end',
  marginTop: 12,
  marginBottom: 12
};
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const fieldLabelStyle: CSSProperties = {
  fontSize: 11,
  color: '#5b6672',
  textTransform: 'uppercase'
};
const inputStyle: CSSProperties = {
  padding: '4px 6px',
  border: '1px solid #cbd2da',
  borderRadius: 6
};
const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '170px 130px 150px 1fr',
  gap: 10,
  padding: '8px 4px',
  borderBottom: '1px solid #eef1f4',
  alignItems: 'baseline'
};
const badgeStyle: CSSProperties = {
  fontSize: 11,
  color: '#33455c',
  background: '#eef2f7',
  borderRadius: 10,
  padding: '1px 8px',
  justifySelf: 'start'
};
const mutedStyle: CSSProperties = { color: '#5b6672', fontSize: 13 };

// Read-only cross-record audit feed (M10 slice 2). Owner/Admin only. Unions existing
// timelines/ledgers; every actionable row links back to its job where one exists.
export function OfficeHistorySurface({
  apiBaseUrl,
  sessionToken,
  onOpenJob
}: OfficeHistorySurfaceProps) {
  const [recordType, setRecordType] = useState<HistoryRecordType | ''>('');
  const [actorEmployeeId, setActorEmployeeId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const buildQuery = useCallback(
    (cursor?: string): HistoryQuery => ({
      recordType: recordType || undefined,
      actorEmployeeId: actorEmployeeId || undefined,
      // Date inputs are day-granular; widen to the full day so the range is inclusive.
      dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
      dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
      cursor,
      limit: PAGE_SIZE
    }),
    [recordType, actorEmployeeId, dateFrom, dateTo]
  );

  const load = useCallback(
    async (cursor?: string) => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await getHistory({ apiBaseUrl, sessionToken, query: buildQuery(cursor) });
        setEntries((prev) => (cursor ? [...prev, ...res.entries] : res.entries));
        setNextCursor(res.nextCursor);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load history.');
      } finally {
        setIsLoading(false);
      }
    },
    [apiBaseUrl, sessionToken, buildQuery]
  );

  // Reload from the top whenever a filter changes (buildQuery identity changes with the filters).
  useEffect(() => {
    void load();
  }, [load]);

  // Populate the actor dropdown (best-effort: owner/admin also hold employeesPermissions:view).
  useEffect(() => {
    void (async () => {
      try {
        const res = await getOfficeEmployees({ apiBaseUrl, sessionToken });
        setEmployees(res.employees);
      } catch {
        // The actor filter is optional; history still works without the employee list.
      }
    })();
  }, [apiBaseUrl, sessionToken]);

  return (
    <section style={styles.workspacePanel} aria-label="History">
      <div style={styles.row}>
        <h1 style={styles.heading}>History</h1>
        <button
          type="button"
          style={styles.button}
          disabled={isLoading}
          onClick={() => void load()}
        >
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div style={filterBarStyle}>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Record type</span>
          <select
            style={inputStyle}
            value={recordType}
            onChange={(e) => setRecordType(e.target.value as HistoryRecordType | '')}
          >
            <option value="">All</option>
            {(Object.keys(RECORD_TYPE_LABELS) as HistoryRecordType[]).map((t) => (
              <option key={t} value={t}>
                {RECORD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Actor</span>
          <select
            style={inputStyle}
            value={actorEmployeeId}
            onChange={(e) => setActorEmployeeId(e.target.value)}
          >
            <option value="">All</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.displayName}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>From</span>
          <input
            type="date"
            style={inputStyle}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>To</span>
          <input
            type="date"
            style={inputStyle}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

      {entries.length === 0 && !isLoading ? (
        <p style={styles.notice}>No history entries for these filters.</p>
      ) : (
        <div>
          {entries.map((entry) => (
            <div key={`${entry.recordType}:${entry.sourceId}`} style={rowStyle}>
              <span style={mutedStyle}>{new Date(entry.occurredAt).toLocaleString()}</span>
              <span style={badgeStyle}>{RECORD_TYPE_LABELS[entry.recordType]}</span>
              <span style={mutedStyle}>{entry.actorName ?? '—'}</span>
              <span>
                {entry.summary}
                {entry.jobId && onOpenJob ? (
                  <button
                    type="button"
                    style={{ ...styles.button, marginLeft: 8, padding: '0 8px' }}
                    onClick={() => onOpenJob(entry.jobId as string)}
                  >
                    View job
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}

      {nextCursor ? (
        <button
          type="button"
          style={{ ...styles.button, marginTop: 12 }}
          disabled={isLoading}
          onClick={() => void load(nextCursor)}
        >
          {isLoading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}
