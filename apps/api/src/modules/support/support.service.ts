import { Injectable } from '@nestjs/common';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SupportExportBundle, SupportExportConfigSummary } from '@bellfield/contracts';
import { getApiRuntimeConfig } from '../../common/config/runtime-config';
import { MediaConfigService } from '../media/media-config.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { SystemDiagnosticsService } from '../system-diagnostics/system-diagnostics.service';

/** Parse host:port and database name from a connection string WITHOUT exposing credentials. */
function parseDatabaseLocation(databaseUrl: string): {
  host: string | null;
  name: string | null;
} {
  try {
    const url = new URL(databaseUrl);
    const host = url.hostname ? `${url.hostname}${url.port ? `:${url.port}` : ''}` : null;
    const name = url.pathname ? url.pathname.replace(/^\//, '') || null : null;
    return { host, name };
  } catch {
    return { host: null, name: null };
  }
}

@Injectable()
export class SupportService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly systemDiagnosticsService: SystemDiagnosticsService,
    private readonly mediaConfigService: MediaConfigService
  ) {}

  /** Owner/Admin-gated, privacy-safe support bundle: diagnostics snapshot + non-secret config. */
  async getSupportExport(sessionToken: string): Promise<SupportExportBundle> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'supportLogsBackups:export',
      ['office-web']
    );

    return {
      generatedAt: new Date().toISOString(),
      generatedByEmployeeId: actor.id,
      diagnostics: await this.systemDiagnosticsService.collectDiagnostics(),
      config: this.buildConfigSummary()
    };
  }

  private buildConfigSummary(): SupportExportConfigSummary {
    const runtime = getApiRuntimeConfig();
    const database = parseDatabaseLocation(runtime.databaseUrl);

    return {
      nodeEnv: runtime.nodeEnv,
      port: runtime.port,
      databaseHost: database.host,
      databaseName: database.name,
      mediaRootPath: this.mediaConfigService.getMediaRoot(),
      mediaMaxBytes: this.mediaConfigService.getMaxByteSize(),
      // Presence only — never the secret value.
      mediaTokenSecretConfigured: Boolean(process.env.BELLFIELD_MEDIA_TOKEN_SECRET?.trim()),
      backupEnabled: getBoolean(process.env.BELLFIELD_BACKUP_ENABLED, true),
      backupRootPath: resolve(
        process.env.BELLFIELD_BACKUP_ROOT?.trim() || join(tmpdir(), 'bellfield-backups-dev')
      ),
      backupRetentionCount: getPositiveInteger(process.env.BELLFIELD_BACKUP_RETENTION_COUNT, 7),
      backupStaleAfterHours: getPositiveInteger(process.env.BELLFIELD_BACKUP_STALE_AFTER_HOURS, 36),
      licenseRequired: runtime.licenseRequired,
      licensePath: runtime.licensePath ?? null
    };
  }
}

function getBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function getPositiveInteger(value: string | undefined, defaultValue: number): number {
  if (!value?.trim()) {
    return defaultValue;
  }

  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}
