import { describe, expect, it } from 'vitest';
import {
  arrayBufferToHex,
  base64ToBytes,
  buildLocalMediaUri,
  buildMediaUploadOperation,
  inferMediaAttachmentKind,
  normalizeContentType,
  normalizePickedFieldMediaAsset,
  type StagedFieldMedia
} from '../field-media-files';

const capturedAt = '2026-05-23T12:00:00.000Z';

describe('field media file helpers', () => {
  it('normalizes picked image and video assets without weakening the media contract', () => {
    expect(
      normalizePickedFieldMediaAsset(
        { uri: 'file:///photo.jpg', fileName: 'bad:name.jpg', mimeType: 'IMAGE/JPEG', type: 'image' },
        'media-1',
        capturedAt
      )
    ).toMatchObject({
      originalFilename: 'bad-name.jpg',
      mediaKind: 'image',
      contentType: 'image/jpeg',
      capturedAt
    });

    expect(inferMediaAttachmentKind('video', 'video/mp4')).toBe('video');
    expect(normalizeContentType(null, 'video')).toBe('video/mp4');
  });

  it('builds durable app-owned media URIs under the BellField media folder', () => {
    expect(buildLocalMediaUri('file:///app/Documents', 'media-1', 'IMG_0001.JPG')).toBe(
      'file:///app/Documents/bellfield-media/media-1.jpg'
    );
  });

  it('decodes base64 and formats sha buffers as lowercase hex', () => {
    expect([...base64ToBytes('AQIDBAU=')]).toEqual([1, 2, 3, 4, 5]);
    expect(arrayBufferToHex(new Uint8Array([1, 35, 255]).buffer)).toBe('0123ff');
  });

  it('builds a media upload pending operation with sha and local URI preserved', () => {
    const stagedMedia: StagedFieldMedia = {
      localMediaId: 'media-1',
      localUri: 'file:///app/Documents/bellfield-media/media-1.jpg',
      originalFilename: 'media-1.jpg',
      mediaKind: 'image',
      contentType: 'image/jpeg',
      byteSize: 5,
      sha256: 'a'.repeat(64),
      capturedAt
    };

    expect(
      buildMediaUploadOperation({
        jobId: 'job-1',
        appointmentId: 'appointment-1',
        stagedMedia,
        caption: '  condenser data plate  ',
        baseUpdatedAt: '2026-05-23T11:55:00.000Z',
        occurredAt: capturedAt
      })
    ).toMatchObject({
      id: 'media-1-upload',
      kind: 'mediaUpload',
      jobId: 'job-1',
      appointmentId: 'appointment-1',
      localUri: stagedMedia.localUri,
      sha256: stagedMedia.sha256,
      caption: 'condenser data plate',
      state: 'pending'
    });
  });
});
