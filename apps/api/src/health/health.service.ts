import { Injectable } from '@nestjs/common';
import type { HealthStatus } from '@bellfield/contracts';
import { MigrationReadinessService } from '../database/migration-readiness.service';

@Injectable()
export class HealthService {
  constructor(private readonly migrationReadinessService: MigrationReadinessService) {}

  async getHealth(): Promise<HealthStatus> {
    const readiness = await this.migrationReadinessService.getReadiness();
    return {
      status:
        readiness.databaseReachable &&
        readiness.migrationsReadable &&
        readiness.pendingMigrationCount === 0
          ? 'ok'
          : 'degraded',
      timestamp: new Date().toISOString()
    };
  }
}
