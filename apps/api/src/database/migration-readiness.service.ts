import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

export type MigrationReadinessSnapshot = {
  databaseReachable: boolean;
  migrationsReadable: boolean;
  appliedMigrationCount: number | null;
  pendingMigrationCount: number | null;
  latestAppliedFilename: string | null;
  pendingMigrationFilenames: string[];
  error?: string;
};

type MigrationRow = {
  filename: string;
};

@Injectable()
export class MigrationReadinessService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getReadiness(): Promise<MigrationReadinessSnapshot> {
    let migrationFiles: string[];
    try {
      migrationFiles = this.listBundledMigrationFiles();
    } catch {
      return {
        databaseReachable: false,
        migrationsReadable: false,
        appliedMigrationCount: null,
        pendingMigrationCount: null,
        latestAppliedFilename: null,
        pendingMigrationFilenames: [],
        error: 'Bundled migration files are not readable.'
      };
    }

    try {
      await this.databaseService.query('select 1');
      const appliedFilenames = await this.listAppliedMigrationFilenames();
      const appliedSet = new Set(appliedFilenames);
      const pendingMigrationFilenames = migrationFiles.filter(
        (filename) => !appliedSet.has(filename)
      );

      return {
        databaseReachable: true,
        migrationsReadable: true,
        appliedMigrationCount: appliedFilenames.length,
        pendingMigrationCount: pendingMigrationFilenames.length,
        latestAppliedFilename: appliedFilenames.at(-1) ?? null,
        pendingMigrationFilenames
      };
    } catch {
      return {
        databaseReachable: false,
        migrationsReadable: true,
        appliedMigrationCount: null,
        pendingMigrationCount: null,
        latestAppliedFilename: null,
        pendingMigrationFilenames: [],
        error: 'Database or migration status is unavailable.'
      };
    }
  }

  async assertReadyToServe(): Promise<void> {
    const readiness = await this.getReadiness();

    if (!readiness.databaseReachable) {
      throw new Error('BellField API cannot start: database is not reachable.');
    }

    if (!readiness.migrationsReadable) {
      throw new Error('BellField API cannot start: bundled migration files are not readable.');
    }

    if ((readiness.pendingMigrationCount ?? 0) > 0) {
      throw new Error(
        `BellField API cannot start: ${readiness.pendingMigrationCount} pending database migration(s). Run the bundled migration command before starting the API.`
      );
    }
  }

  private listBundledMigrationFiles(): string[] {
    const migrationDir = this.resolveMigrationDirectory();
    return readdirSync(migrationDir)
      .filter((name) => name.endsWith('.up.sql'))
      .sort();
  }

  private resolveMigrationDirectory(): string {
    const candidates = [
      join(__dirname, 'migrations'),
      resolve(process.cwd(), 'apps/api/src/database/migrations'),
      resolve(process.cwd(), 'src/database/migrations'),
      resolve(process.cwd(), 'dist/database/migrations')
    ];

    const migrationDir = candidates.find((candidate) => existsSync(candidate));
    if (!migrationDir) {
      throw new Error('Migration directory not found.');
    }

    return migrationDir;
  }

  private async listAppliedMigrationFilenames(): Promise<string[]> {
    try {
      const result = await this.databaseService.query<MigrationRow>(
        'select filename from schema_migrations order by id asc'
      );
      return result.rows.map((row) => row.filename);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === '42P01'
      ) {
        return [];
      }
      throw error;
    }
  }
}
