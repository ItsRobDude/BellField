import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendEstimateDocumentRequestDto } from './send-estimate-document.dto';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: 'estimate-send-msg-1',
    documentType: 'estimate',
    recipientEmail: 'homeowner@example.com',
    fromName: 'Acme HVAC',
    replyToEmail: 'office@acme.example',
    subject: 'Your estimate',
    bodyText: 'Estimate attached.',
    document: {
      filename: 'estimate.pdf',
      contentType: 'application/pdf',
      bytesBase64: Buffer.from('%PDF-1.7 test').toString('base64')
    },
    ...overrides
  };
}

describe('SendEstimateDocumentRequestDto', () => {
  it('accepts estimate and invoice document types', () => {
    for (const documentType of ['estimate', 'invoice']) {
      const dto = plainToInstance(SendEstimateDocumentRequestDto, validPayload({ documentType }));

      expect(validateSync(dto)).toHaveLength(0);
    }
  });

  it('rejects unknown document types', () => {
    for (const documentType of ['receipt', null]) {
      const dto = plainToInstance(SendEstimateDocumentRequestDto, validPayload({ documentType }));

      expect(validateSync(dto)).not.toHaveLength(0);
    }
  });

  it('allows missing document type for legacy estimate-only callers', () => {
    const payload = validPayload();
    Reflect.deleteProperty(payload, 'documentType');
    const dto = plainToInstance(SendEstimateDocumentRequestDto, payload);

    expect(validateSync(dto)).toHaveLength(0);
  });
});
