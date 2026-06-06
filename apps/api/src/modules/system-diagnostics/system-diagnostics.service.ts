import { readFileSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SystemDiagnosticsResponse } from '@bellfield/contracts';
import { getApiRuntimeConfig } from '../../common/config/runtime-config';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { MediaConfigService } from '../media/media-config.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';

/** Best-effort app version from the api package.json (cwd at runtime); never throws. */
function readAppVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? 'unknown';
  } catch {
    return process.env.npm_package_version ?? 'unknown';
  }
}

@Injectable()
export class SystemDiagnosticsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityAccessService: IdentityAccessService,
    private readonly mediaConfigService: MediaConfigService
  ) {}

  /** Owner/Admin-gated diagnostics for the office System surface. */
  async getDiagnostics(sessionToken: string): Promise<SystemDiagnosticsResponse> {
    await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'supportLogsBackups:view',
      ['office-web']
    );
    return this.collectDiagnostics();
  }

  /**
   * Compute the readiness snapshot. No auth (the support export reuses it after its own gate).
   * Every sub-check is wrapped so a single failure never throws the whole response — the UI can
   * then render a partial-red status instead of an error page.
   */
  async collectDiagnostics(): Promise<SystemDiagnosticsResponse> {
    const database = await this.checkDatabase();
    const migrations = await this.checkMigrations();
    const mediaRoot = this.checkMediaRoot();

    return {
      serverTime: new Date().toISOString(),
      app: {
        name: 'BellField API',
        version: readAppVersion(),
        nodeEnv: getApiRuntimeConfig().nodeEnv
      },
      database,
      migrations,
      mediaRoot,
      checks: [
        { key: 'database', ok: database.reachable, detail: database.error },
        {
          key: 'migrations',
          ok: migrations.appliedCount > 0,
          detail: migrations.latestFilename ?? `${migrations.appliedCount} applied`
        },
        {
          key: 'mediaRoot',
          ok: mediaRoot.writable && mediaRoot.readable,
          detail: mediaRoot.error
        }
      ]
    };
  }

  private async checkDatabase(): Promise<SystemDiagnosticsResponse['database']> {
    const started = Date.now();
    try {
      await this.databaseService.query('select 1');
      return { reachable: true, latencyMs: Date.now() - started };
    } catch {
      // Never leak the connection string in the message.
      return { reachable: false, latencyMs: null, error: 'Database unreachable.' };
    }
  }

  private async checkMigrations(): Promise<SystemDiagnosticsResponse['migrations']> {
    try {
      const counted = await this.databaseService.query<{ count: number }>(
        'select count(*)::int as count from schema_migrations'
      );
      const latest = await this.databaseService.query<{
        filename: string;
        appliedAt: string | Date;
      }>(
        'select filename, applied_at as "appliedAt" from schema_migrations order by id desc limit 1'
      );
      const latestRow = latest.rows[0];
      return {
        appliedCount: Number(counted.rows[0]?.count ?? 0),
        latestFilename: latestRow?.filename ?? null,
        latestAppliedAt: latestRow ? toIsoString(latestRow.appliedAt) : null
      };
    } catch {
      return { appliedCount: 0, latestFilename: null, latestAppliedAt: null };
    }
  }

  private checkMediaRoot(): SystemDiagnosticsResponse['mediaRoot'] {
    const path = this.mediaConfigService.getMediaRoot();
    const exists = existsSync(path);
    try {
      // Round-trip a tiny probe file to prove both write and read access, then clean up.
      const probePath = join(path, `.diagnostics-probe-${randomUUID()}`);
      writeFileSync(probePath, 'ok');
      const readable = readFileSync(probePath, 'utf8') === 'ok';
      unlinkSync(probePath);
      return { path, exists, writable: true, readable };
    } catch {
      return { path, exists, writable: false, readable: false, error: 'Media root not writable.' };
    }
  }
}
