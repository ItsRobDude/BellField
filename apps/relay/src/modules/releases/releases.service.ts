import * as path from 'node:path';
import { stat } from 'node:fs/promises';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { RelayShopIdentity } from '../identity/relay-identity.types';
import {
  isReleaseWithinUpdateWindow,
  type RelayReleaseRecord,
  type RelayReleasesStore
} from './releases.types';

export const RELAY_RELEASES_STORE = 'RELAY_RELEASES_STORE';

export type ReleaseListing = {
  releases: {
    id: string;
    version: string;
    releaseDate: string;
    sha256: string;
    byteSize: number;
    entitled: boolean;
  }[];
  updateWindowEnd: string | null;
};

export type ReleaseDownloadResolution =
  | { kind: 'ok'; release: RelayReleaseRecord; absolutePath: string }
  | { kind: 'notFound' }
  | { kind: 'notEntitled' }
  | { kind: 'unavailable' };

@Injectable()
export class ReleasesService {
  constructor(
    @Inject(RELAY_RELEASES_STORE) private readonly releasesStore: RelayReleasesStore,
    @Optional() private readonly artifactsRoot?: string,
    @Optional() private readonly now: () => Date = () => new Date()
  ) {}

  async listReleasesForShop(shop: RelayShopIdentity): Promise<ReleaseListing> {
    const releases = await this.releasesStore.listReleases();
    return {
      releases: releases.map((release) => ({
        id: release.id,
        version: release.version,
        releaseDate: release.releaseDate,
        sha256: release.sha256,
        byteSize: release.byteSize,
        entitled: isReleaseWithinUpdateWindow(release.releaseDate, shop.updateWindowEnd)
      })),
      updateWindowEnd: shop.updateWindowEnd
    };
  }

  /**
   * Resolves a download to a verified path under the artifacts root and
   * records it. The artifact's own signature (Phase 4) remains the integrity
   * proof on the installing side; the sha256 here is bookkeeping the operator
   * can check after transfer.
   */
  async resolveDownload(
    shop: RelayShopIdentity,
    releaseId: string
  ): Promise<ReleaseDownloadResolution> {
    if (!this.artifactsRoot) {
      return { kind: 'unavailable' };
    }
    const release = await this.releasesStore.findReleaseById(releaseId);
    if (!release) {
      return { kind: 'notFound' };
    }
    if (!isReleaseWithinUpdateWindow(release.releaseDate, shop.updateWindowEnd)) {
      return { kind: 'notEntitled' };
    }

    const root = path.resolve(this.artifactsRoot);
    const candidate = path.resolve(root, release.filename);
    const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
    if (!candidate.startsWith(normalizedRoot)) {
      return { kind: 'notFound' };
    }
    try {
      const fileStat = await stat(candidate);
      if (!fileStat.isFile()) {
        return { kind: 'notFound' };
      }
    } catch {
      return { kind: 'notFound' };
    }

    await this.releasesStore.recordDownload({
      shopId: shop.shopId,
      releaseId: release.id,
      downloadedAt: this.now()
    });
    return { kind: 'ok', release, absolutePath: candidate };
  }
}
