import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './estimates.service';

describe('EstimatesController', () => {
  let app: NestExpressApplication;
  const estimatesService = {
    exportEstimatePdfDocument: jest.fn()
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EstimatesController],
      providers: [{ provide: EstimatesService, useValue: estimatesService }]
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Regression guard: returning the raw Buffer from the handler made the
  // Express adapter JSON-serialize it ({"type":"Buffer","data":[...]}), which
  // produced unopenable PDF downloads while service-level specs stayed green.
  it('serves the estimate PDF as raw bytes, not JSON-serialized Buffer output', async () => {
    const pdfBytes = Buffer.from('%PDF-1.7\nfake-estimate-pdf-body');
    estimatesService.exportEstimatePdfDocument.mockResolvedValueOnce({
      filename: 'estimate-water-heater.pdf',
      contentType: 'application/pdf',
      bytes: pdfBytes
    });

    const response = await request(app.getHttpServer())
      .get('/operations/estimates/estimate-1/pdf')
      .set('Authorization', 'Bearer session-token-1')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="estimate-water-heater.pdf"'
    );
    const body = response.body as Buffer;
    expect(body.equals(pdfBytes)).toBe(true);
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
