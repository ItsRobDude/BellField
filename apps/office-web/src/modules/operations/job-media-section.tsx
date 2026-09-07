'use client';

import type { JobSummary, MediaAttachmentSummary } from '@/lib/operations-api';
import {
  formatAppointmentReference,
  formatByteSize,
  formatDateTime,
  formatMediaKind
} from './job-detail-format';
import type { CapturedWorkDetails } from './job-work-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type JobMediaSectionProps = {
  job: JobSummary;
  capturedWork?: CapturedWorkDetails;
  onMediaCaptionChange: (jobId: string, mediaId: string, caption: string) => void;
  onSaveMediaCaption: (jobId: string, mediaId: string) => Promise<void>;
  onMediaVoidReasonChange: (jobId: string, mediaId: string, reason: string) => void;
  onVoidMediaAttachment: (jobId: string, mediaId: string) => Promise<void>;
  onOpenMediaAttachment: (jobId: string, mediaId: string) => Promise<void>;
};

export function JobMediaSection({
  job,
  capturedWork,
  onMediaCaptionChange,
  onSaveMediaCaption,
  onMediaVoidReasonChange,
  onVoidMediaAttachment,
  onOpenMediaAttachment
}: JobMediaSectionProps) {
  if (!capturedWork || capturedWork.isLoading) {
    return <p style={styles.muted}>Loading media...</p>;
  }

  if (capturedWork.mediaAttachments.length === 0) {
    return <p style={styles.muted}>No media.</p>;
  }

  return (
    <div style={styles.list}>
      {capturedWork.mediaAttachments.map((media) =>
        renderMediaAttachment({
          job,
          media,
          captionDraft: capturedWork.mediaCaptionDrafts[media.id] ?? '',
          voidReason: capturedWork.mediaVoidReasons[media.id] ?? '',
          onMediaCaptionChange,
          onSaveMediaCaption,
          onMediaVoidReasonChange,
          onVoidMediaAttachment,
          onOpenMediaAttachment
        })
      )}
    </div>
  );
}

function renderMediaAttachment({
  job,
  media,
  captionDraft,
  voidReason,
  onMediaCaptionChange,
  onSaveMediaCaption,
  onMediaVoidReasonChange,
  onVoidMediaAttachment,
  onOpenMediaAttachment
}: {
  job: JobSummary;
  media: MediaAttachmentSummary;
  captionDraft: string;
  voidReason: string;
  onMediaCaptionChange: JobMediaSectionProps['onMediaCaptionChange'];
  onSaveMediaCaption: JobMediaSectionProps['onSaveMediaCaption'];
  onMediaVoidReasonChange: JobMediaSectionProps['onMediaVoidReasonChange'];
  onVoidMediaAttachment: JobMediaSectionProps['onVoidMediaAttachment'];
  onOpenMediaAttachment: JobMediaSectionProps['onOpenMediaAttachment'];
}) {
  return (
    <section key={media.id} style={media.isVoid ? styles.mutedPanel : styles.panel}>
      <div style={styles.row}>
        <div>
          <strong>{media.originalFilename}</strong>
          <p style={styles.tinyMuted}>
            {formatMediaKind(media.kind)} - {formatByteSize(media.byteSize)}
            {media.appointmentId
              ? ` - ${formatAppointmentReference(job, media.appointmentId)}`
              : ''}
          </p>
        </div>
        <div style={styles.badgeRow}>
          <span style={media.uploadCompleted ? styles.badge : styles.dangerBadge}>
            {media.uploadCompleted ? 'Uploaded' : 'Pending'}
          </span>
          {media.isVoid ? <span style={styles.dangerBadge}>Voided</span> : null}
        </div>
      </div>
      <p style={styles.tinyMuted}>
        {formatDateTime(media.capturedAt)} - {media.capturedByName}
      </p>
      {media.isVoid ? (
        <p style={styles.tinyMuted}>
          {media.voidReason ? `Void reason: ${media.voidReason}` : 'Voided.'}
        </p>
      ) : (
        <>
          <textarea
            aria-label={`Media caption for ${media.originalFilename}`}
            value={captionDraft}
            onChange={(event) => onMediaCaptionChange(job.id, media.id, event.target.value)}
            placeholder="Caption"
            style={styles.textarea}
          />
          <div style={styles.inlineActionBar}>
            <button
              type="button"
              style={styles.button}
              onClick={() => void onSaveMediaCaption(job.id, media.id)}
            >
              Save
            </button>
            <button
              type="button"
              disabled={!media.uploadCompleted}
              style={styles.button}
              onClick={() => void onOpenMediaAttachment(job.id, media.id)}
            >
              Open
            </button>
            <input
              aria-label={`Void reason for ${media.originalFilename}`}
              value={voidReason}
              onChange={(event) => onMediaVoidReasonChange(job.id, media.id, event.target.value)}
              placeholder="Void reason"
              style={styles.input}
            />
            <button
              type="button"
              style={styles.dangerButton}
              onClick={() => void onVoidMediaAttachment(job.id, media.id)}
            >
              Void
            </button>
          </div>
        </>
      )}
    </section>
  );
}
