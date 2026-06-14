import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { MediaConfigService } from '../media/media-config.service';

@Injectable()
export class CustomerDocumentStorageService {
  constructor(private readonly mediaConfigService: MediaConfigService) {}

  async writeEstimatePdf(input: {
    jobId: string;
    estimateId: string;
    snapshotId: string;
    bytes: Buffer;
  }): Promise<{ storagePath: string; sha256: string; byteSize: number }> {
    return this.writeCustomerDocumentPdf({
      jobId: input.jobId,
      sourceFolder: 'estimates',
      sourceId: input.estimateId,
      sourceLabel: 'estimate id',
      snapshotId: input.snapshotId,
      bytes: input.bytes
    });
  }

  async writeInvoicePdf(input: {
    jobId: string;
    invoiceId: string;
    snapshotId: string;
    bytes: Buffer;
  }): Promise<{ storagePath: string; sha256: string; byteSize: number }> {
    return this.writeCustomerDocumentPdf({
      jobId: input.jobId,
      sourceFolder: 'invoices',
      sourceId: input.invoiceId,
      sourceLabel: 'invoice id',
      snapshotId: input.snapshotId,
      bytes: input.bytes
    });
  }

  private async writeCustomerDocumentPdf(input: {
    jobId: string;
    sourceFolder: 'estimates' | 'invoices';
    sourceId: string;
    sourceLabel: string;
    snapshotId: string;
    bytes: Buffer;
  }): Promise<{ storagePath: string; sha256: string; byteSize: number }> {
    const relativePath = path.join(
      'customer-documents',
      'jobs',
      safePathSegment(input.jobId, 'job id'),
      input.sourceFolder,
      safePathSegment(input.sourceId, input.sourceLabel),
      `${safePathSegment(input.snapshotId, 'snapshot id')}.pdf`
    );
    const absolutePath = this.resolveUnderMediaRoot(relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.bytes);
    return {
      storagePath: relativePath,
      sha256: sha256(input.bytes),
      byteSize: input.bytes.byteLength
    };
  }

  async readEstimatePdf(storagePath: string, expectedSha256: string): Promise<Buffer> {
    const absolutePath = this.resolveUnderMediaRoot(storagePath);
    const bytes = await readFile(absolutePath);
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== expectedSha256) {
      throw new Error('Stored estimate PDF hash did not match its delivery snapshot.');
    }
    return bytes;
  }

  private resolveUnderMediaRoot(relativePath: string): string {
    const root = this.mediaConfigService.getMediaRoot();
    const candidate = path.resolve(root, relativePath);
    const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
    if (candidate !== root && !candidate.startsWith(normalizedRoot)) {
      throw new Error('Resolved customer document path escaped the configured media root.');
    }
    return candidate;
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function safePathSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${label} for customer document storage.`);
  }
  return value;
}
