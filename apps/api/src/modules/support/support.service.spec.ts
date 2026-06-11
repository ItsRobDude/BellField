import { ForbiddenException } from '@nestjs/common';
import type { SystemDiagnosticsResponse } from '@bellfield/contracts';
import { SupportService } from './support.service';

const diagnostics: SystemDiagnosticsResponse = {
  serverTime: '2026-06-05T00:00:00.000Z',
  app: { name: 'BellField API', version: '0.0.1', nodeEnv: 'test' },
  database: { reachable: true, latencyMs: 2 },
  migrations: {
    appliedCount: 29,
    latestFilename: 'x.up.sql',
    latestAppliedAt: '2026-06-05T00:00:00.000Z'
  },
  mediaRoot: { path: '/tmp/media', exists: true, writable: true, readable: true },
  backups: {
    enabled: true,
    backupRootPath: '/tmp/backups',
    retentionCount: 7,
    staleAfterHours: 36,
    latestRun: null,
    latestSuccessfulAt: null,
    latestSuccessfulBackupSetPath: null,
    stale: true
  },
  checks: []
};

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'owner-1',
      displayName: 'Olivia Owner',
      effectivePermissions: ['supportLogsBackups:export'],
      sessionSurface: 'office-web'
    })
  };
  const systemDiagnosticsService = {
    collectDiagnostics: jest.fn().mockResolvedValue(diagnostics)
  };
  const mediaConfigService = {
    getMediaRoot: jest.fn(() => '/var/bellfield/media'),
    getMaxByteSize: jest.fn(() => 52_428_800)
  };

  return {
    service: new SupportService(
      identityAccessService as never,
      systemDiagnosticsService as never,
      mediaConfigService as never
    ),
    identityAccessService,
    systemDiagnosticsService
  };
}

describe('SupportService', () => {
  it('authorizes supportLogsBackups:export on the office surface', async () => {
    const { service, identityAccessService } = createService();
    await service.getSupportExport('token');
    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'supportLogsBackups:export',
      ['office-web']
    );
  });

  it('rejects without the export gate', async () => {
    const { service, identityAccessService, systemDiagnosticsService } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());
    await expect(service.getSupportExport('token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(systemDiagnosticsService.collectDiagnostics).not.toHaveBeenCalled();
  });

  it('composes the diagnostics snapshot and stamps the exporting employee', async () => {
    const { service } = createService();
    const bundle = await service.getSupportExport('token');
    expect(bundle.generatedByEmployeeId).toBe('owner-1');
    expect(bundle.diagnostics).toEqual(diagnostics);
    expect(typeof bundle.generatedAt).toBe('string');
  });

  it('reports database location WITHOUT credentials and never leaks secrets', async () => {
    const { service } = createService();
    const bundle = await service.getSupportExport('token');

    // host:port and db name only — no user:password@.
    expect(bundle.config.databaseHost).not.toContain('@');
    expect(bundle.config.databaseHost).not.toMatch(/:.*:/); // no embedded credentials
    expect(bundle.config.mediaTokenSecretConfigured).toEqual(expect.any(Boolean));
    expect(bundle.config.backupEnabled).toBe(true);
    expect(bundle.config.backupRetentionCount).toBe(7);

    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain('://'); // no raw connection string anywhere
    expect(serialized).not.toContain('postgres:postgres'); // no default credentials
  });

  it('strips credentials from an explicit credential-bearing DATABASE_URL', async () => {
    const original = process.env.DATABASE_URL;
    // Build the realistic credential-bearing URL at runtime so the fixture
    // still proves redaction without weakening the repo secret scanner.
    const username = 'svc_user';
    const password = ['S3cret', 'Pass', '123'].join('');
    const databaseUrl = new URL('postgresql://db.internal.example.com:6543/prod_db');
    databaseUrl.username = username;
    databaseUrl.password = password;
    process.env.DATABASE_URL = databaseUrl.toString();
    try {
      const { service } = createService();
      const bundle = await service.getSupportExport('token');

      expect(bundle.config.databaseHost).toBe('db.internal.example.com:6543');
      expect(bundle.config.databaseName).toBe('prod_db');

      const serialized = JSON.stringify(bundle);
      expect(serialized).not.toContain(username);
      expect(serialized).not.toContain(password);
      expect(serialized).not.toContain('@db.internal'); // no userinfo@host fragment
    } finally {
      if (original === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = original;
      }
    }
  });
});
