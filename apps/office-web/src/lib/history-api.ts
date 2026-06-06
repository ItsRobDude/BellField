import type { HistoryQuery, HistoryResponse } from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

export type {
  HistoryEntry,
  HistoryRecordType,
  HistoryResponse,
  HistoryQuery
} from '@bellfield/contracts';

export async function getHistory(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  query?: HistoryQuery;
}): Promise<HistoryResponse> {
  const query = input.query ?? {};
  const params = new URLSearchParams();
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  if (query.actorEmployeeId) params.set('actorEmployeeId', query.actorEmployeeId);
  if (query.recordType) params.set('recordType', query.recordType);
  if (query.jobId) params.set('jobId', query.jobId);
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit) params.set('limit', String(query.limit));

  const qs = params.toString();
  return requestJson<HistoryResponse>(`/operations/history${qs ? `?${qs}` : ''}`, {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}
