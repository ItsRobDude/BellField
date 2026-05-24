import * as FileSystem from 'expo-file-system';
import type { MediaAttachmentResponse } from '@/lib/operations-api';
import { resolveFieldApiBaseUrl } from '@/lib/api-base-url';
import { FieldMediaUploadError } from './field-media-errors';

export async function uploadFieldMediaBlob(input: {
  apiBaseUrl?: string;
  mediaId: string;
  uploadToken: string;
  localUri: string;
}): Promise<MediaAttachmentResponse> {
  const uploadUrl = buildFieldMediaBlobUploadUrl(input);
  const response = await FileSystem.uploadAsync(uploadUrl, input.localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': 'application/octet-stream'
    }
  });

  if (response.status < 200 || response.status >= 300) {
    throw new FieldMediaUploadError(
      parseMediaUploadErrorBody(response.body) ?? 'Unable to upload media bytes.',
      response.status
    );
  }

  return JSON.parse(response.body) as MediaAttachmentResponse;
}

export function buildFieldMediaBlobUploadUrl(input: {
  apiBaseUrl?: string;
  mediaId: string;
  uploadToken: string;
}): string {
  const apiBaseUrl = resolveFieldApiBaseUrl(input.apiBaseUrl);
  return `${apiBaseUrl}/operations/media/${encodeURIComponent(input.mediaId)}/blob?token=${encodeURIComponent(
    input.uploadToken
  )}`;
}

function parseMediaUploadErrorBody(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    return parsed.message ?? null;
  } catch {
    return body.trim() || null;
  }
}
