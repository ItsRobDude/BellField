import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

describe('MediaController', () => {
  let app: NestExpressApplication;
  const mediaService = {
    listForJob: jest.fn(),
    createUploadIntent: jest.fn(),
    getById: jest.fn(),
    updateMedia: jest.fn(),
    voidMedia: jest.fn(),
    finalizeBlobUpload: jest.fn(),
    authorizeBlobDownload: jest.fn(),
    openBlobReadStream: jest.fn()
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: mediaService }]
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    app.useBodyParser('raw', { type: 'application/octet-stream', limit: 1024 });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes application/octet-stream bytes to the media upload service', async () => {
    mediaService.finalizeBlobUpload.mockResolvedValueOnce({
      mediaAttachment: {
        id: 'media-1',
        jobId: 'job-1',
        kind: 'image',
        contentType: 'image/jpeg',
        byteSize: 5,
        sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        originalFilename: 'photo.jpg',
        capturedByEmployeeId: 'tech-1',
        capturedByName: 'Field Tech',
        capturedAt: '2026-04-14T11:00:00.000Z',
        uploadCompleted: true,
        isVoid: false,
        createdAt: '2026-04-14T11:00:00.000Z',
        updatedAt: '2026-04-14T11:05:00.000Z'
      }
    });

    await request(app.getHttpServer())
      .post('/operations/media/media-1/blob?token=upload-token')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('hello'))
      .expect(201);

    expect(mediaService.finalizeBlobUpload).toHaveBeenCalledWith(
      'media-1',
      'upload-token',
      expect.any(Buffer)
    );
    expect(mediaService.finalizeBlobUpload.mock.calls[0]?.[2].toString()).toBe('hello');
  });
});
