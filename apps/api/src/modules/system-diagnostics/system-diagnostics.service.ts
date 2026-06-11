import { readFileSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SystemDiagnosticsResponse } from '@bellfield/contracts';
import { getApiRuntimeConfig } from '../../common/config/runtime-config';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { MediaConfigService } from '../media/media-config.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { verifyLicenseFile } from '../licensing/license-verification';

const defaultBackupRetentionCount = 7;
const defaultBackupStaleAfterHours = 36;

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
    const backups = await this.checkBackups();
    const license = this.checkLicense();
    const estimateTaxRates = await this.checkEstimateTaxRates();
    const seededAccounts = await this.checkSeededAccounts();

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
      backups,
      license,
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
        },
        {
          key: 'backups',
          ok:
            backups.enabled &&
            !backups.stale &&
            !backups.error &&
            backups.latestRun?.status !== 'failed',
          detail: backupCheckDetail(backups)
        },
        {
          key: 'license',
          ok: license.status === 'valid' || license.status === 'notRequired',
          detail: licenseCheckDetail(license)
        },
        estimateTaxRates,
        seededAccounts
      ]
    };
  }

  /**
   * Seeded local accounts are useful in development but dangerous if they make
   * it to a production-like machine. Surface them without exposing names.
   */
  private async checkSeededAccounts(): Promise<SystemDiagnosticsResponse['checks'][number]> {
    try {
      const result = await this.databaseService.query<{ count: number }>(
        `select count(*)::int as count
         from employees
         where is_active = true
           and lower(email) like '%@bellfield.local'`
      );
      const count = Number(result.rows[0]?.count ?? 0);
      return count === 0
        ? { key: 'seededAccounts', ok: true }
        : {
            key: 'seededAccounts',
            ok: false,
            detail: `${count} active seeded BellField account(s) still exist.`
          };
    } catch {
      // Connectivity problems are already reported by the database check.
      return { key: 'seededAccounts', ok: true };
    }
  }

  /**
   * Audit for estimates whose stored sales tax rate predates the 0-25% bound.
   * Such rows are preserved as-is (history-safe) but flagged here so support
   * can see them; there is deliberately no automatic clamp.
   */
  private async checkEstimateTaxRates(): Promise<SystemDiagnosticsResponse['checks'][number]> {
    try {
      const result = await this.databaseService.query<{ count: number }>(
        'select count(*)::int as count from estimates where tax_rate_basis_points > 2500'
      );
      const count = Number(result.rows[0]?.count ?? 0);
      return count === 0
        ? { key: 'estimateTaxRates', ok: true }
        : {
            key: 'estimateTaxRates',
            ok: false,
            detail: `${count} estimate(s) carry a stored sales tax rate above 25%.`
          };
    } catch {
      // Connectivity problems are already reported by the database check.
      return { key: 'estimateTaxRates', ok: true };
    }
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
    const probePath = join(path, `.diagnostics-probe-${randomUUID()}`);
    let wrote = false;
    try {
      // Round-trip a tiny probe file to prove both write and read access.
      writeFileSync(probePath, 'ok');
      wrote = true;
      const readable = readFileSync(probePath, 'utf8') === 'ok';
      return { path, exists, writable: true, readable };
    } catch {
      return { path, exists, writable: false, readable: false, error: 'Media root not writable.' };
    } finally {
      // Always clean up the probe, even if the read above threw after a successful write.
      if (wrote) {
        try {
          unlinkSync(probePath);
        } catch {
          // Probe cleanup is best-effort; a leftover dotfile is harmless.
        }
      }
    }
  }

  private async checkBackups(): Promise<SystemDiagnosticsResponse['backups']> {
    const enabled = getBoolean(process.env.BELLFIELD_BACKUP_ENABLED, true);
    const backupRootPath = resolve(
      process.env.BELLFIELD_BACKUP_ROOT?.trim() || join(tmpdir(), 'bellfield-backups-dev')
    );
    const retentionCount = getPositiveInteger(
      process.env.BELLFIELD_BACKUP_RETENTION_COUNT,
      defaultBackupRetentionCount
    );
    const staleAfterHours = getPositiveInteger(
      process.env.BELLFIELD_BACKUP_STALE_AFTER_HOURS,
      defaultBackupStaleAfterHours
    );

    if (!enabled) {
      return {
        enabled,
        backupRootPath,
        retentionCount,
        staleAfterHours,
        latestRun: null,
        latestSuccessfulAt: null,
        latestSuccessfulBackupSetPath: null,
        stale: true,
        error: 'Scheduled backups are disabled.'
      };
    }

    try {
      const latestRunResult = await this.databaseService.query<BackupRunRow>(
        `select status,
                started_at as "startedAt",
                completed_at as "completedAt",
                backup_set_path as "backupSetPath",
                error_message as "errorMessage"
           from backup_runs
          order by started_at desc
          limit 1`
      );
      const latestSuccessfulResult = await this.databaseService.query<{
        completedAt: string | Date;
        backupSetPath: string;
      }>(
        `select completed_at as "completedAt",
                backup_set_path as "backupSetPath"
           from backup_runs
          where status = 'succeeded'
            and backup_set_deleted_at is null
          order by completed_at desc
          limit 1`
      );

      const latestRun = latestRunResult.rows[0];
      const latestSuccessful = latestSuccessfulResult.rows[0];
      const latestSuccessfulAt = latestSuccessful
        ? toIsoString(latestSuccessful.completedAt)
        : null;

      return {
        enabled,
        backupRootPath,
        retentionCount,
        staleAfterHours,
        latestRun: latestRun ? mapBackupRun(latestRun) : null,
        latestSuccessfulAt,
        latestSuccessfulBackupSetPath: latestSuccessful?.backupSetPath ?? null,
        stale: isBackupStale(latestSuccessfulAt, staleAfterHours)
      };
    } catch {
      return {
        enabled,
        backupRootPath,
        retentionCount,
        staleAfterHours,
        latestRun: null,
        latestSuccessfulAt: null,
        latestSuccessfulBackupSetPath: null,
        stale: true,
        error: 'Backup run history is unavailable.'
      };
    }
  }

  private checkLicense(): SystemDiagnosticsResponse['license'] {
    const runtime = getApiRuntimeConfig();

    if (!runtime.licenseRequired && !runtime.licensePath) {
      return {
        required: false,
        path: null,
        status: 'notRequired'
      };
    }

    const verification = verifyLicenseFile({ licensePath: runtime.licensePath });
    if (verification.status === 'valid') {
      return {
        required: runtime.licenseRequired,
        path: runtime.licensePath ?? null,
        status: 'valid',
        licenseId: verification.license.licenseId,
        shopName: verification.license.shopName,
        issuedAt: verification.license.issuedAt,
        updateWindowEnd: verification.license.updateWindowEnd
      };
    }

    return {
      required: runtime.licenseRequired,
      path: runtime.licensePath ?? null,
      status: verification.status,
      message: verification.message
    };
  }
}

type BackupRunRow = {
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string | Date;
  completedAt: string | Date | null;
  backupSetPath: string | null;
  errorMessage: string | null;
};

function mapBackupRun(row: BackupRunRow): SystemDiagnosticsResponse['backups']['latestRun'] {
  return {
    status: row.status,
    startedAt: toIsoString(row.startedAt),
    completedAt: row.completedAt ? toIsoString(row.completedAt) : null,
    backupSetPath: row.backupSetPath,
    errorMessage: row.errorMessage ?? undefined
  };
}

function isBackupStale(latestSuccessfulAt: string | null, staleAfterHours: number): boolean {
  if (!latestSuccessfulAt) {
    return true;
  }

  const ageMs = Date.now() - new Date(latestSuccessfulAt).getTime();
  return ageMs > staleAfterHours * 60 * 60 * 1_000;
}

function backupCheckDetail(backups: SystemDiagnosticsResponse['backups']): string | undefined {
  if (backups.error) {
    return backups.error;
  }
  if (!backups.enabled) {
    return 'Scheduled backups are disabled.';
  }
  if (!backups.latestSuccessfulAt) {
    return 'No successful backup has been recorded.';
  }
  if (backups.stale) {
    return `Last successful backup is older than ${backups.staleAfterHours} hours.`;
  }
  if (backups.latestRun?.status === 'failed') {
    return backups.latestRun.errorMessage
      ? `Latest backup failed: ${backups.latestRun.errorMessage}`
      : 'Latest backup failed.';
  }
  return undefined;
}

function licenseCheckDetail(license: SystemDiagnosticsResponse['license']): string | undefined {
  if (license.status === 'notRequired' || license.status === 'valid') {
    return undefined;
  }
  return license.message ?? 'License needs attention.';
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
