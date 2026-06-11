import { HealthService } from './health.service';

function createService(readiness: {
  databaseReachable: boolean;
  migrationsReadable: boolean;
  pendingMigrationCount: number | null;
}) {
  const migrationReadinessService = {
    getReadiness: jest.fn().mockResolvedValue({
      appliedMigrationCount: readiness.pendingMigrationCount === 0 ? 1 : 0,
      latestAppliedFilename: null,
      pendingMigrationFilenames: [],
      ...readiness
    })
  };

  return new HealthService(migrationReadinessService as never);
}

describe('HealthService', () => {
  it('returns ok when the database is reachable and no migrations are pending', async () => {
    const service = createService({
      databaseReachable: true,
      migrationsReadable: true,
      pendingMigrationCount: 0
    });

    await expect(service.getHealth()).resolves.toEqual({
      status: 'ok',
      timestamp: expect.any(String)
    });
  });

  it('returns degraded when readiness is incomplete', async () => {
    const service = createService({
      databaseReachable: true,
      migrationsReadable: true,
      pendingMigrationCount: 2
    });

    await expect(service.getHealth()).resolves.toEqual({
      status: 'degraded',
      timestamp: expect.any(String)
    });
  });
});
