import { isFieldApiError, type CreateMediaUploadIntentResponse } from '@/lib/operations-api';
import { isFieldMediaUploadError } from './field-media-errors';
import type { PendingOperation } from './field-sync-types';

export type MediaUploadOperation = Extract<PendingOperation, { kind: 'mediaUpload' }>;

export type FieldMediaReplayResult =
  | { status: 'applied' }
  | { status: 'rejected'; message: string };

export type FieldMediaReplayDependencies = {
  createUploadIntent: (operation: MediaUploadOperation) => Promise<CreateMediaUploadIntentResponse>;
  uploadBlob: (input: {
    mediaId: string;
    uploadToken: string;
    localUri: string;
  }) => Promise<unknown>;
};

export async function replayFieldMediaUploadOperation(
  operation: MediaUploadOperation,
  dependencies: FieldMediaReplayDependencies
): Promise<FieldMediaReplayResult> {
  let uploadIntent: CreateMediaUploadIntentResponse;

  try {
    uploadIntent = await dependencies.createUploadIntent(operation);
  } catch (error) {
    const rejection = getDeterministicMediaRejection(error);
    if (rejection) {
      return rejection;
    }
    throw error;
  }

  if (uploadIntent.uploadCompleted) {
    return { status: 'applied' };
  }

  if (!uploadIntent.uploadToken) {
    throw new Error('The media upload intent did not include an upload token.');
  }

  try {
    await dependencies.uploadBlob({
      mediaId: uploadIntent.mediaAttachment.id,
      uploadToken: uploadIntent.uploadToken,
      localUri: operation.localUri
    });
  } catch (error) {
    const rejection = getDeterministicMediaRejection(error);
    if (rejection) {
      return rejection;
    }
    throw error;
  }

  return { status: 'applied' };
}

function getDeterministicMediaRejection(error: unknown): FieldMediaReplayResult | null {
  if (!isFieldApiError(error) && !isFieldMediaUploadError(error)) {
    return null;
  }

  if (isDeterministicMediaFailureStatus(error.status)) {
    return {
      status: 'rejected',
      message: error.message
    };
  }

  return null;
}

function isDeterministicMediaFailureStatus(status: number): boolean {
  return status === 400 || status === 409 || status === 413 || status === 415;
}
