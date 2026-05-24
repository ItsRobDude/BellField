import type { CreateMediaUploadIntentResponse } from '@/lib/operations-api';
import type { PendingOperation } from './field-sync-types';

export type MediaUploadOperation = Extract<PendingOperation, { kind: 'mediaUpload' }>;

export type FieldMediaReplayDependencies = {
  createUploadIntent: (operation: MediaUploadOperation) => Promise<CreateMediaUploadIntentResponse>;
  uploadBlob: (input: { mediaId: string; uploadToken: string; localUri: string }) => Promise<unknown>;
};

export async function replayFieldMediaUploadOperation(
  operation: MediaUploadOperation,
  dependencies: FieldMediaReplayDependencies
): Promise<void> {
  const uploadIntent = await dependencies.createUploadIntent(operation);

  if (uploadIntent.uploadCompleted) {
    return;
  }

  if (!uploadIntent.uploadToken) {
    throw new Error('The media upload intent did not include an upload token.');
  }

  await dependencies.uploadBlob({
    mediaId: uploadIntent.mediaAttachment.id,
    uploadToken: uploadIntent.uploadToken,
    localUri: operation.localUri
  });
}
