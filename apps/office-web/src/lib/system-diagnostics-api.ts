import type { SystemDiagnosticsResponse } from '@bellfield/contracts';
import { requestBlob, requestJson } from './operations-api-base';

export type { SystemDiagnosticsResponse, SystemDiagnosticsCheck } from '@bellfield/contracts';

export async function getSystemDiagnostics(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<SystemDiagnosticsResponse> {
  return requestJson<SystemDiagnosticsResponse>('/system/diagnostics', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

/** Fetch the owner/admin support bundle as a downloadable JSON blob. */
export async function downloadSupportExport(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<Blob> {
  return requestBlob('/system/support-export', {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}
