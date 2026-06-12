export type RelayReleaseRecord = {
  id: string;
  version: string;
  releaseDate: string;
  filename: string;
  sha256: string;
  byteSize: number;
  publishedAt: Date;
};

export interface RelayReleasesStore {
  listReleases(): Promise<RelayReleaseRecord[]>;
  findReleaseById(releaseId: string): Promise<RelayReleaseRecord | null>;
  findReleaseByVersion(version: string): Promise<RelayReleaseRecord | null>;
  publishRelease(input: {
    id: string;
    version: string;
    releaseDate: string;
    filename: string;
    sha256: string;
    byteSize: number;
  }): Promise<void>;
  recordDownload(input: { shopId: string; releaseId: string; downloadedAt: Date }): Promise<void>;
}

/**
 * Download entitlement mirrors the updater's clock-independent rule exactly:
 * plain string compare of YYYY-MM-DD dates, boundary inclusive. A shop with
 * no recorded window is not entitled until support records one.
 */
export function isReleaseWithinUpdateWindow(
  releaseDate: string,
  updateWindowEnd: string | null
): boolean {
  return updateWindowEnd !== null && releaseDate <= updateWindowEnd;
}
