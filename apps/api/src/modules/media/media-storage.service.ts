import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { MediaConfigService } from './media-config.service';

const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'application/pdf': '.pdf',
  'text/plain': '.txt'
};

@Injectable()
export class MediaStorageService {
  constructor(private readonly mediaConfig: MediaConfigService) {}

  extensionFor(contentType: string): string {
    return MEDIA_EXTENSIONS[contentType.toLowerCase()] ?? '';
  }

  resolveBlobPath(jobId: string, mediaId: string, contentType: string): string {
    return this.mediaConfig.resolveBlobPath(jobId, mediaId, this.extensionFor(contentType));
  }

  async writeBlob(jobId: string, mediaId: string, contentType: string, bytes: Buffer): Promise<string> {
    const absolutePath = this.resolveBlobPath(jobId, mediaId, contentType);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
    return path.relative(this.mediaConfig.getMediaRoot(), absolutePath);
  }

  hashBytes(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  async statBlob(storagePath: string): Promise<{ exists: boolean; byteSize: number }> {
    try {
      const absolutePath = this.toAbsolutePath(storagePath);
      const statResult = await stat(absolutePath);
      return { exists: statResult.isFile(), byteSize: statResult.size };
    } catch {
      return { exists: false, byteSize: 0 };
    }
  }

  createBlobReadStream(storagePath: string) {
    return createReadStream(this.toAbsolutePath(storagePath));
  }

  toAbsolutePath(storagePath: string): string {
    const root = this.mediaConfig.getMediaRoot();
    const candidate = path.resolve(root, storagePath);
    const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
    if (candidate !== root && !candidate.startsWith(normalizedRoot)) {
      throw new Error('Stored media path escaped the configured media root.');
    }
    return candidate;
  }
}
