import type { MediaAttachmentKind } from '@/lib/operations-api';
import type { PendingOperation } from './field-sync-types';

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type PickedFieldMediaAsset = {
  uri: string;
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string | null;
  type?: 'image' | 'video' | 'livePhoto' | 'pairedVideo';
};

export type StagedFieldMedia = {
  localMediaId: string;
  localUri: string;
  originalFilename: string;
  mediaKind: MediaAttachmentKind;
  contentType: string;
  byteSize: number;
  sha256: string;
  capturedAt: string;
};

export function normalizePickedFieldMediaAsset(
  asset: PickedFieldMediaAsset,
  localMediaId: string,
  capturedAt: string
): Omit<StagedFieldMedia, 'localUri' | 'byteSize' | 'sha256'> {
  const contentType = normalizeContentType(asset.mimeType, asset.type);
  const mediaKind = inferMediaAttachmentKind(asset.type, contentType);
  const originalFilename = sanitizeOriginalFilename(
    asset.fileName ?? buildFallbackFilename(localMediaId, mediaKind, contentType)
  );

  return {
    localMediaId,
    originalFilename,
    mediaKind,
    contentType,
    capturedAt
  };
}

export function buildLocalMediaUri(baseDirectory: string, localMediaId: string, originalFilename: string): string {
  const normalizedBase = baseDirectory.endsWith('/') ? baseDirectory : `${baseDirectory}/`;
  const extension = getFileExtension(originalFilename);
  return `${normalizedBase}bellfield-media/${localMediaId}${extension}`;
}

export function buildMediaUploadOperation(input: {
  jobId: string;
  appointmentId?: string;
  stagedMedia: StagedFieldMedia;
  caption?: string;
  baseUpdatedAt?: string;
  occurredAt?: string;
}): PendingOperation {
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  return {
    id: `${input.stagedMedia.localMediaId}-upload`,
    kind: 'mediaUpload',
    jobId: input.jobId,
    appointmentId: input.appointmentId,
    localMediaId: input.stagedMedia.localMediaId,
    localUri: input.stagedMedia.localUri,
    originalFilename: input.stagedMedia.originalFilename,
    mediaKind: input.stagedMedia.mediaKind,
    contentType: input.stagedMedia.contentType,
    byteSize: input.stagedMedia.byteSize,
    sha256: input.stagedMedia.sha256,
    caption: input.caption?.trim() || undefined,
    capturedAt: input.stagedMedia.capturedAt,
    occurredAt,
    baseUpdatedAt: input.baseUpdatedAt,
    state: 'pending'
  };
}

export function base64ToBytes(value: string): Uint8Array {
  const cleanValue = value.replace(/\s+/g, '');
  const paddingLength = cleanValue.endsWith('==') ? 2 : cleanValue.endsWith('=') ? 1 : 0;
  const outputLength = Math.floor((cleanValue.length * 3) / 4) - paddingLength;
  const bytes = new Uint8Array(outputLength);
  let outputIndex = 0;

  for (let inputIndex = 0; inputIndex < cleanValue.length; inputIndex += 4) {
    const chunk = cleanValue.slice(inputIndex, inputIndex + 4);
    const values = chunk.split('').map((character) => {
      if (character === '=') {
        return 0;
      }

      const index = base64Alphabet.indexOf(character);
      if (index === -1) {
        throw new Error('Invalid base64 media data.');
      }

      return index;
    });

    const combined = ((values[0] ?? 0) << 18) | ((values[1] ?? 0) << 12) | ((values[2] ?? 0) << 6) | (values[3] ?? 0);

    if (outputIndex < outputLength) {
      bytes[outputIndex++] = (combined >> 16) & 255;
    }

    if (outputIndex < outputLength) {
      bytes[outputIndex++] = (combined >> 8) & 255;
    }

    if (outputIndex < outputLength) {
      bytes[outputIndex++] = combined & 255;
    }
  }

  return bytes;
}

export function arrayBufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function inferMediaAttachmentKind(
  assetType: PickedFieldMediaAsset['type'],
  contentType: string
): MediaAttachmentKind {
  if (assetType === 'video' || contentType.startsWith('video/')) {
    return 'video';
  }

  return 'image';
}

export function normalizeContentType(
  mimeType: string | null | undefined,
  assetType: PickedFieldMediaAsset['type']
): string {
  if (mimeType?.trim()) {
    return mimeType.trim().toLowerCase();
  }

  return assetType === 'video' ? 'video/mp4' : 'image/jpeg';
}

function buildFallbackFilename(localMediaId: string, mediaKind: MediaAttachmentKind, contentType: string): string {
  const extension = contentTypeToExtension(contentType) ?? (mediaKind === 'video' ? 'mp4' : 'jpg');
  return `${localMediaId}.${extension}`;
}

function sanitizeOriginalFilename(value: string): string {
  const safeName = value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return safeName || 'field-media.jpg';
}

function getFileExtension(filename: string): string {
  const match = filename.match(/\.[a-zA-Z0-9]{1,12}$/);
  return match ? match[0].toLowerCase() : '.bin';
}

function contentTypeToExtension(contentType: string): string | null {
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    return 'jpg';
  }

  if (contentType === 'image/png') {
    return 'png';
  }

  if (contentType === 'image/webp') {
    return 'webp';
  }

  if (contentType === 'image/heic') {
    return 'heic';
  }

  if (contentType === 'video/mp4') {
    return 'mp4';
  }

  if (contentType === 'video/quicktime') {
    return 'mov';
  }

  if (contentType === 'video/webm') {
    return 'webm';
  }

  return null;
}
