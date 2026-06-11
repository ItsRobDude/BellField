import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationReadinessService } from './migration-readiness.service';

const migrationFilenames = readdirSync(resolve(__dirname, 'migrations'))
  .filter((name) => name.endsWith('.up.sql'))
  .sort();

function createService(
  opts: { appliedFilenames?: string[]; failSelect?: boolean; missingSchemaTable?: boolean } = {}
) {
  const databaseService = {
    query: jest.fn(async (sql: string) => {
      if (opts.failSelect && sql === 'select 1') {
        throw new Error('connection refused');
      }
      if (sql.includes('from schema_migrations')) {
        if (opts.missingSchemaTable) {
          throw Object.assign(new Error('missing schema table'), { code: '42P01' });
        }
        return {
          rows: (opts.appliedFilenames ?? migrationFilenames).map((filename) => ({ filename }))
        };
      }
      return { rows: [] };
    })
  };

  return {
    service: new MigrationReadinessService(databaseService as never),
    databaseService
  };
}

describe('MigrationReadinessService', () => {
  it('reports ready when every bundled migration has been applied', async () => {
    const { service } = createService();

    const readiness = await service.getReadiness();

    expect(readiness.databaseReachable).toBe(true);
    expect(readiness.migrationsReadable).toBe(true);
    expect(readiness.pendingMigrationCount).toBe(0);
    expect(readiness.latestAppliedFilename).toBe(migrationFilenames.at(-1));
    await expect(service.assertReadyToServe()).resolves.toBeUndefined();
  });

  it('reports pending migrations and refuses production startup', async () => {
    const { service } = createService({ appliedFilenames: migrationFilenames.slice(0, 1) });

    const readiness = await service.getReadiness();

    expect(readiness.databaseReachable).toBe(true);
    expect(readiness.pendingMigrationCount).toBeGreaterThan(0);
    expect(readiness.pendingMigrationFilenames).toContain(migrationFilenames[1]);
    await expect(service.assertReadyToServe()).rejects.toThrow(/pending database migration/);
  });

  it('treats a missing schema_migrations table as no migrations applied', async () => {
    const { service } = createService({ missingSchemaTable: true });

    const readiness = await service.getReadiness();

    expect(readiness.databaseReachable).toBe(true);
    expect(readiness.appliedMigrationCount).toBe(0);
    expect(readiness.pendingMigrationCount).toBe(migrationFilenames.length);
  });

  it('reports degraded readiness without leaking raw database errors', async () => {
    const { service } = createService({ failSelect: true });

    const readiness = await service.getReadiness();

    expect(readiness.databaseReachable).toBe(false);
    expect(readiness.error).toBe('Database or migration status is unavailable.');
  });
});
