import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { ReleasesService } from './releases.service';
import {
  isReleaseWithinUpdateWindow,
  type RelayReleaseRecord,
  type RelayReleasesStore
} from './releases.types';
import type { RelayShopIdentity } from '../identity/relay-identity.types';

class InMemoryReleasesStore implements RelayReleasesStore {
  releases: RelayReleaseRecord[] = [];
  downloads: { shopId: string; releaseId: string }[] = [];

  async listReleases() {
    return this.releases;
  }

  async findReleaseById(releaseId: string) {
    return this.releases.find((release) => release.id === releaseId) ?? null;
  }

  async findReleaseByVersion(version: string) {
    return this.releases.find((release) => release.version === version) ?? null;
  }

  async publishRelease(input: {
    id: string;
    version: string;
    releaseDate: string;
    filename: string;
    sha256: string;
    byteSize: number;
  }) {
    this.releases.push({ ...input, publishedAt: new Date('2026-06-11T00:00:00Z') });
  }

  async recordDownload(input: { shopId: string; releaseId: string; downloadedAt: Date }) {
    this.downloads.push({ shopId: input.shopId, releaseId: input.releaseId });
  }
}

function makeRelease(overrides?: Partial<RelayReleaseRecord>): RelayReleaseRecord {
  return {
    id: 'rel-1',
    version: '1.2.3',
    releaseDate: '2026-06-11',
    filename: 'bellfield-1.2.3.zip',
    sha256: 'a'.repeat(64),
    byteSize: 4,
    publishedAt: new Date('2026-06-11T00:00:00Z'),
    ...overrides
  };
}

const shopInWindow: RelayShopIdentity = {
  shopId: 'shop_1',
  displayName: 'Acme HVAC',
  updateWindowEnd: '2027-01-01'
};

describe('isReleaseWithinUpdateWindow', () => {
  it('is boundary inclusive and string-compared, mirroring the updater', () => {
    expect(isReleaseWithinUpdateWindow('2026-06-11', '2026-06-11')).toBe(true);
    expect(isReleaseWithinUpdateWindow('2026-06-11', '2026-06-12')).toBe(true);
    expect(isReleaseWithinUpdateWindow('2026-06-12', '2026-06-11')).toBe(false);
  });

  it('treats a missing window as not entitled', () => {
    expect(isReleaseWithinUpdateWindow('2026-06-11', null)).toBe(false);
  });
});

describe('ReleasesService', () => {
  it('lists releases with per-shop entitlement flags', async () => {
    const store = new InMemoryReleasesStore();
    store.releases = [
      makeRelease({ id: 'rel-1', version: '1.0.0', releaseDate: '2026-01-01' }),
      makeRelease({ id: 'rel-2', version: '2.0.0', releaseDate: '2027-06-01' })
    ];
    const service = new ReleasesService(store, undefined);

    const listing = await service.listReleasesForShop(shopInWindow);

    expect(listing.updateWindowEnd).toBe('2027-01-01');
    expect(listing.releases.map((release) => release.entitled)).toEqual([true, false]);
  });

  it('streams an entitled release from the artifacts root and records the download', async () => {
    const artifactsRoot = mkdtempSync(path.join(tmpdir(), 'bellfield-releases-test-'));
    try {
      writeFileSync(path.join(artifactsRoot, 'bellfield-1.2.3.zip'), 'zip!');
      const store = new InMemoryReleasesStore();
      store.releases = [makeRelease()];
      const service = new ReleasesService(
        store,
        artifactsRoot,
        () => new Date('2026-06-11T12:00:00Z')
      );

      const resolution = await service.resolveDownload(shopInWindow, 'rel-1');

      expect(resolution.kind).toBe('ok');
      if (resolution.kind === 'ok') {
        expect(resolution.absolutePath).toBe(path.join(artifactsRoot, 'bellfield-1.2.3.zip'));
      }
      expect(store.downloads).toEqual([{ shopId: 'shop_1', releaseId: 'rel-1' }]);
    } finally {
      rmSync(artifactsRoot, { force: true, recursive: true });
    }
  });

  it('refuses a release past the shop update window', async () => {
    const store = new InMemoryReleasesStore();
    store.releases = [makeRelease({ releaseDate: '2027-06-01' })];
    const service = new ReleasesService(store, tmpdir());

    const resolution = await service.resolveDownload(shopInWindow, 'rel-1');

    expect(resolution.kind).toBe('notEntitled');
    expect(store.downloads).toHaveLength(0);
  });

  it('refuses a filename that escapes the artifacts root', async () => {
    const artifactsRoot = mkdtempSync(path.join(tmpdir(), 'bellfield-releases-test-'));
    try {
      mkdirSync(path.join(artifactsRoot, 'inner'));
      writeFileSync(path.join(artifactsRoot, 'secret.txt'), 'secret');
      const store = new InMemoryReleasesStore();
      store.releases = [makeRelease({ filename: '../secret.txt' })];
      const service = new ReleasesService(store, path.join(artifactsRoot, 'inner'));

      const resolution = await service.resolveDownload(shopInWindow, 'rel-1');

      expect(resolution.kind).toBe('notFound');
    } finally {
      rmSync(artifactsRoot, { force: true, recursive: true });
    }
  });

  it('reports notFound for an unregistered release or missing file', async () => {
    const store = new InMemoryReleasesStore();
    store.releases = [makeRelease({ filename: 'missing.zip' })];
    const service = new ReleasesService(store, tmpdir());

    expect((await service.resolveDownload(shopInWindow, 'rel-x')).kind).toBe('notFound');
    expect((await service.resolveDownload(shopInWindow, 'rel-1')).kind).toBe('notFound');
  });

  it('reports unavailable when no artifacts root is configured', async () => {
    const store = new InMemoryReleasesStore();
    store.releases = [makeRelease()];
    const service = new ReleasesService(store, undefined);

    expect((await service.resolveDownload(shopInWindow, 'rel-1')).kind).toBe('unavailable');
  });
});
