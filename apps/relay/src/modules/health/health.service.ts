import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export type RelayHealth = {
  status: 'ok' | 'degraded';
  timestamp: string;
};

@Injectable()
export class HealthService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getHealth(): Promise<RelayHealth> {
    let databaseReachable = false;
    try {
      await this.databaseService.query('SELECT 1');
      databaseReachable = true;
    } catch {
      databaseReachable = false;
    }

    return {
      status: databaseReachable ? 'ok' : 'degraded',
      timestamp: new Date().toISOString()
    };
  }
}
