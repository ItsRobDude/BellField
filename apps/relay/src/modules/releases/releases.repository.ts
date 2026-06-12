import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { RelayReleaseRecord, RelayReleasesStore } from './releases.types';

type ReleaseRow = {
  id: string;
  version: string;
  release_date: string;
  filename: string;
  sha256: string;
  byte_size: string | number;
  published_at: Date;
};

const RELEASE_COLUMNS = 'id, version, release_date, filename, sha256, byte_size, published_at';

@Injectable()
export class RelayReleasesRepository implements RelayReleasesStore {
  constructor(private readonly database: DatabaseService) {}

  async listReleases(): Promise<RelayReleaseRecord[]> {
    const result = await this.database.query<ReleaseRow>(
      `SELECT ${RELEASE_COLUMNS} FROM relay_releases ORDER BY release_date DESC, version DESC`
    );
    return result.rows.map(toRecord);
  }

  async findReleaseById(releaseId: string): Promise<RelayReleaseRecord | null> {
    const result = await this.database.query<ReleaseRow>(
      `SELECT ${RELEASE_COLUMNS} FROM relay_releases WHERE id = $1`,
      [releaseId]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  async findReleaseByVersion(version: string): Promise<RelayReleaseRecord | null> {
    const result = await this.database.query<ReleaseRow>(
      `SELECT ${RELEASE_COLUMNS} FROM relay_releases WHERE version = $1`,
      [version]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  async publishRelease(input: {
    id: string;
    version: string;
    releaseDate: string;
    filename: string;
    sha256: string;
    byteSize: number;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO relay_releases (id, version, release_date, filename, sha256, byte_size)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.id, input.version, input.releaseDate, input.filename, input.sha256, input.byteSize]
    );
  }

  async recordDownload(input: {
    shopId: string;
    releaseId: string;
    downloadedAt: Date;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO relay_release_downloads (id, shop_id, release_id, downloaded_at)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), input.shopId, input.releaseId, input.downloadedAt]
    );
  }
}

function toRecord(row: ReleaseRow): RelayReleaseRecord {
  return {
    id: row.id,
    version: row.version,
    releaseDate: row.release_date,
    filename: row.filename,
    sha256: row.sha256,
    byteSize: Number(row.byte_size),
    publishedAt: row.published_at
  };
}
