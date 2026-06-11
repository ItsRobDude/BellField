import { HealthService } from './health.service';
import type { DatabaseService } from '../../database/database.service';

describe('HealthService', () => {
  it('reports ok when the database answers', async () => {
    const databaseService = {
      query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    } as unknown as DatabaseService;
    const service = new HealthService(databaseService);

    const health = await service.getHealth();

    expect(health.status).toBe('ok');
    expect(typeof health.timestamp).toBe('string');
  });

  it('reports degraded when the database is unreachable', async () => {
    const databaseService = {
      query: jest.fn().mockRejectedValue(new Error('connection refused'))
    } as unknown as DatabaseService;
    const service = new HealthService(databaseService);

    const health = await service.getHealth();

    expect(health.status).toBe('degraded');
  });
});
