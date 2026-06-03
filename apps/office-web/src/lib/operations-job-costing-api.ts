import type {
  CreateJobExpenseRequest,
  CreateJobLaborRequest,
  JobCostEventResponse,
  JobCostingResponse,
  ReverseJobCostEventRequest
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

// Job-costing contract types, re-exported for the office UI.
export type {
  JobCostEvent,
  JobCostEventKind,
  JobCostRollup,
  JobCostSnapshot,
  JobCostingSummary,
  JobCostingResponse,
  JobCostEventResponse,
  CreateJobLaborRequest,
  CreateJobExpenseRequest,
  ReverseJobCostEventRequest
} from '@bellfield/contracts';

/** A job's cost read model: live rollup, finalized snapshot, and labor/expense events. */
export async function getOfficeJobCosting(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
}): Promise<JobCostingResponse> {
  return requestJson<JobCostingResponse>(`/operations/jobs/${input.jobId}/costing`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** Post a labor cost event to a job (amount = hours × ratePerHour). */
export async function postOfficeJobLabor(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  body: CreateJobLaborRequest;
}): Promise<JobCostEventResponse> {
  return requestJson<JobCostEventResponse>(`/operations/jobs/${input.jobId}/labor`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Post an expense cost event to a job. */
export async function postOfficeJobExpense(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  body: CreateJobExpenseRequest;
}): Promise<JobCostEventResponse> {
  return requestJson<JobCostEventResponse>(`/operations/jobs/${input.jobId}/expenses`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Reverse (correct) a labor/expense cost event by posting its negation. */
export async function reverseOfficeJobCostEvent(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  eventId: string;
  body: ReverseJobCostEventRequest;
}): Promise<JobCostEventResponse> {
  return requestJson<JobCostEventResponse>(
    `/operations/jobs/${input.jobId}/cost-events/${input.eventId}/reverse`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'POST',
      body: JSON.stringify(input.body)
    }
  );
}
