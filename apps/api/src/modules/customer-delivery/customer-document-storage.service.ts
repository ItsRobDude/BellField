import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
    const relativePath = path.join(
      'customer-documents',
      'jobs',
      safePathSegment(input.jobId, 'job id'),
      'estimates',
      safePathSegment(input.estimateId, 'estimate id'),
      `${safePathSegment(input.snapshotId, 'snapshot id')}.pdf`
    );
    const absolutePath = this.resolveUnderMediaRoot(relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.bytes);
    return {
      storagePath: relativePath,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      byteSize: input.bytes.byteLength
    };
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

function safePathSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${label} for customer document storage.`);
  }
  return value;
}
