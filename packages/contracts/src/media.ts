export type MediaAttachmentKind = 'image' | 'video' | 'document';

export type MediaSignedTokenScope = 'upload' | 'download';

export interface MediaAttachmentSummary {
  id: string;
  jobId: string;
  appointmentId?: string;
  kind: MediaAttachmentKind;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string;
  caption?: string;
  capturedByEmployeeId: string;
  capturedByName: string;
  capturedAt: string;
  /** True once the blob bytes have been uploaded to the server. */
  uploadCompleted: boolean;
  uploadedAt?: string;
  isVoid: boolean;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAttachmentsResponse {
  mediaAttachments: MediaAttachmentSummary[];
}

export interface MediaAttachmentResponse {
  mediaAttachment: MediaAttachmentSummary;
}

export interface CreateMediaUploadIntentRequest {
  appointmentId?: string;
  kind: MediaAttachmentKind;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string;
  caption?: string;
  capturedAt?: string;
}

export interface CreateMediaUploadIntentResponse {
  mediaAttachment: MediaAttachmentSummary;
  /** True when an existing media row with the same (jobId, sha256) already had bytes uploaded. */
  uploadCompleted: boolean;
  /** Short-lived HMAC token the caller must present to POST /operations/media/:id/blob. Absent when uploadCompleted is true. */
  uploadToken?: string;
  /** ISO timestamp marking when the upload token expires. Absent when uploadCompleted is true. */
  uploadTokenExpiresAt?: string;
  /** Maximum byte size the server will accept on the blob upload, mirroring server-side guardrails. */
  maxByteSize: number;
}

export interface UpdateMediaAttachmentRequest {
  caption?: string | null;
}

export interface VoidMediaAttachmentRequest {
  reason?: string;
}
