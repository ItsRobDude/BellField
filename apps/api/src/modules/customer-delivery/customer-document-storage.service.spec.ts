import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CustomerDocumentStorageService } from './customer-document-storage.service';

describe('CustomerDocumentStorageService', () => {
  let mediaRoot: string;

  beforeEach(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'bellfield-customer-docs-'));
  });

  afterEach(async () => {
    await rm(mediaRoot, { force: true, recursive: true });
  });

  function createService() {
    return new CustomerDocumentStorageService({
      getMediaRoot: () => mediaRoot
    } as never);
  }

  it('reads a stored estimate PDF when the expected hash matches', async () => {
    const service = createService();
    const bytes = Buffer.from('%PDF estimate snapshot');
    const stored = await service.writeEstimatePdf({
      jobId: 'job-1',
      estimateId: 'estimate-1',
      snapshotId: 'snapshot-1',
      bytes
    });

    await expect(service.readEstimatePdf(stored.storagePath, stored.sha256)).resolves.toEqual(
      bytes
    );
  });

  it('refuses to return a stored estimate PDF when the hash does not match', async () => {
    const service = createService();
    const stored = await service.writeEstimatePdf({
      jobId: 'job-1',
      estimateId: 'estimate-1',
      snapshotId: 'snapshot-1',
      bytes: Buffer.from('%PDF estimate snapshot')
    });

    await expect(service.readEstimatePdf(stored.storagePath, '0'.repeat(64))).rejects.toThrow(
      'Stored estimate PDF hash did not match'
    );
  });
});
