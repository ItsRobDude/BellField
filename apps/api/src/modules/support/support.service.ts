import { Injectable } from '@nestjs/common';
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
      mediaTokenSecretConfigured: Boolean(process.env.BELLFIELD_MEDIA_TOKEN_SECRET?.trim())
    };
  }
}
