import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ForbiddenException } from '@nestjs/common';
import { SystemDiagnosticsService } from './system-diagnostics.service';

function createService(
  overrides: {
    mediaRoot?: string;
    estimateTaxRateCount?: number;
    seededAccountCount?: number;
    backupRunsUnavailable?: boolean;
    latestBackupRun?: {
      status: 'running' | 'succeeded' | 'failed';
      startedAt: Date;
      completedAt: Date | null;
      backupSetPath: string | null;
      errorMessage: string | null;
    };
    latestSuccessfulBackup?: {
      completedAt: Date;
      backupSetPath: string;
    };
  } = {}
) {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'owner-1',
      displayName: 'Olivia Owner',
      effectivePermissions: ['supportLogsBackups:view'],
      sessionSurface: 'office-web'
    })
  };
  const databaseService = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('from backup_runs')) {
        if (overrides.backupRunsUnavailable) {
          throw new Error('relation backup_runs does not exist');
        }
        if (sql.includes("where status = 'succeeded'")) {
          return {
            rows: overrides.latestSuccessfulBackup ? [overrides.latestSuccessfulBackup] : []
          };
        }
        return {
          rows: overrides.latestBackupRun ? [overrides.latestBackupRun] : []
        };
      }
      if (sql.includes('order by id desc')) {
        return {
          rows: [
            {
              filename: '20260601_029_register_client_operation_id.up.sql',
              appliedAt: new Date('2026-06-05T00:00:00.000Z')
            }
          ]
        };
      }
      if (sql.includes('from schema_migrations')) {
        return { rows: [{ count: 29 }] };
      }
      if (sql.includes('from estimates')) {
        return { rows: [{ count: overrides.estimateTaxRateCount ?? 0 }] };
      }
      if (sql.includes('from employees')) {
        return { rows: [{ count: overrides.seededAccountCount ?? 0 }] };
      }
      return { rows: [] }; // select 1
    })
  };
  const mediaConfigService = {
    // Default to a writable real dir so the probe round-trips.
    getMediaRoot: jest.fn(() => overrides.mediaRoot ?? tmpdir()),
    getMaxByteSize: jest.fn(() => 52_428_800)
  };

  return {
    service: new SystemDiagnosticsService(
      databaseService as never,
      identityAccessService as never,
      mediaConfigService as never
    ),
    identityAccessService,
    databaseService,
    mediaConfigService
  };
}

describe('SystemDiagnosticsService', () => {
  it('authorizes supportLogsBackups:view on the office surface', async () => {
    const { service, identityAccessService } = createService();
    await service.getDiagnostics('token');
    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'supportLogsBackups:view',
      ['office-web']
    );
  });

  it('rejects when the gate is missing (no diagnostics computed)', async () => {
    const { service, identityAccessService, databaseService } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());
    await expect(service.getDiagnostics('token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(databaseService.query).not.toHaveBeenCalled();
  });

  it('reports a reachable database with a latency and maps migration status', async () => {
    const { service } = createService();
    const result = await service.collectDiagnostics();

    expect(result.database.reachable).toBe(true);
    expect(typeof result.database.latencyMs).toBe('number');
    expect(result.migrations.appliedCount).toBe(29);
    expect(result.migrations.latestFilename).toBe(
      '20260601_029_register_client_operation_id.up.sql'
    );
    expect(result.migrations.latestAppliedAt).toBe('2026-06-05T00:00:00.000Z');
    expect(result.app.name).toBe('BellField API');
    expect(result.backups.stale).toBe(true);
    expect(result.checks.find((c) => c.key === 'backups')?.ok).toBe(false);
    expect(result.checks.find((c) => c.key === 'database')?.ok).toBe(true);
  });

  it('surfaces active seeded BellField accounts as an owner-visible check', async () => {
    const { service } = createService({ seededAccountCount: 2 });

    const result = await service.collectDiagnostics();

    expect(result.checks.find((check) => check.key === 'seededAccounts')).toEqual({
      key: 'seededAccounts',
      ok: false,
      detail: '2 active seeded BellField account(s) still exist.'
    });
  });

  it('never throws when the database is unreachable — reports it instead', async () => {
    const { service, databaseService } = createService();
    databaseService.query.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    const result = await service.collectDiagnostics();

    expect(result.database.reachable).toBe(false);
    expect(result.database.latencyMs).toBeNull();
    // Sanitized — never the raw connection error / string.
    expect(result.database.error).toBe('Database unreachable.');
    expect(result.migrations.appliedCount).toBe(0);
    expect(result.checks.find((c) => c.key === 'database')?.ok).toBe(false);
  });

  it('probes the media root read/write', async () => {
    const { service } = createService(); // tmpdir() is writable
    const result = await service.collectDiagnostics();
    expect(result.mediaRoot.writable).toBe(true);
    expect(result.mediaRoot.readable).toBe(true);
  });

  it('reports an unwritable media root without throwing', async () => {
    const { service } = createService({
      mediaRoot: join(tmpdir(), 'bf-does-not-exist-xyz', 'sub')
    });
    const result = await service.collectDiagnostics();
    expect(result.mediaRoot.exists).toBe(false);
    expect(result.mediaRoot.writable).toBe(false);
    expect(result.mediaRoot.error).toBeTruthy();
    expect(result.checks.find((c) => c.key === 'mediaRoot')?.ok).toBe(false);
  });

  it('reports a current successful backup as green', async () => {
    const { service } = createService({
      latestBackupRun: {
        status: 'succeeded',
        startedAt: new Date(),
        completedAt: new Date(),
        backupSetPath: 'C:\\BellField\\data\\backups\\bellfield-backup-current',
        errorMessage: null
      },
      latestSuccessfulBackup: {
        completedAt: new Date(),
        backupSetPath: 'C:\\BellField\\data\\backups\\bellfield-backup-current'
      }
    });

    const result = await service.collectDiagnostics();

    expect(result.backups.latestRun?.status).toBe('succeeded');
    expect(result.backups.latestSuccessfulAt).toEqual(expect.any(String));
    expect(result.backups.stale).toBe(false);
    expect(result.checks.find((c) => c.key === 'backups')?.ok).toBe(true);
  });

  it('reports backup history failures without throwing diagnostics', async () => {
    const { service } = createService({ backupRunsUnavailable: true });

    const result = await service.collectDiagnostics();

    expect(result.backups.error).toBe('Backup run history is unavailable.');
    expect(result.checks.find((c) => c.key === 'backups')).toEqual({
      key: 'backups',
      ok: false,
      detail: 'Backup run history is unavailable.'
    });
  });
});
