import { DatabaseBootstrapService } from './database-bootstrap.service';

type CapturedQuery = { sql: string; params: unknown[] | undefined };

function captureBootstrapQueries(): {
  service: DatabaseBootstrapService;
  captured: CapturedQuery[];
} {
  const captured: CapturedQuery[] = [];
  const databaseService = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      captured.push({ sql, params });
      return { rows: [] };
    })
  };
  const service = new DatabaseBootstrapService(databaseService as never);
  return { service, captured };
}

function extractInsertColumnBlock(sql: string): string | null {
  const match = sql.match(/insert\s+into\s+\w+\s*\(([\s\S]*?)\)\s*values/i);
  return match ? match[1] : null;
}

function extractValuesBlock(sql: string): string | null {
  const match = sql.match(/values\s*\(([^)]+)\)/i);
  return match ? match[1] : null;
}

function countColumns(columnBlock: string): number {
  return columnBlock
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

function countPlaceholders(valuesBlock: string): number {
  const matches = valuesBlock.match(/\$\d+/g);
  return matches ? matches.length : 0;
}

describe('DatabaseBootstrapService', () => {
  const originalSeedFlag = process.env.BOOTSTRAP_SEED_DATA;

  beforeAll(() => {
    process.env.BOOTSTRAP_SEED_DATA = 'true';
  });

  afterAll(() => {
    if (originalSeedFlag === undefined) {
      delete process.env.BOOTSTRAP_SEED_DATA;
    } else {
      process.env.BOOTSTRAP_SEED_DATA = originalSeedFlag;
    }
  });

  it('emits seed insert SQL with matching column and placeholder counts and no trailing comma', async () => {
    const { service, captured } = captureBootstrapQueries();

    await service.onModuleInit();

    const inserts = captured.filter((entry) => /^\s*insert\s+into\s+/i.test(entry.sql));
    expect(inserts.length).toBeGreaterThan(0);

    const uniqueInsertSql = Array.from(new Set(inserts.map((entry) => entry.sql)));

    for (const sql of uniqueInsertSql) {
      const columnBlock = extractInsertColumnBlock(sql);
      const valuesBlock = extractValuesBlock(sql);

      expect(columnBlock).not.toBeNull();
      expect(valuesBlock).not.toBeNull();

      const trimmedColumnBlock = (columnBlock ?? '').trim();
      expect(trimmedColumnBlock.endsWith(',')).toBe(false);

      const columnCount = countColumns(columnBlock ?? '');
      const placeholderCount = countPlaceholders(valuesBlock ?? '');

      expect(columnCount).toBe(placeholderCount);
    }
  });

  it('passes a parameter array whose length matches the placeholder count for every insert', async () => {
    const { service, captured } = captureBootstrapQueries();

    await service.onModuleInit();

    const inserts = captured.filter((entry) => /^\s*insert\s+into\s+/i.test(entry.sql));

    for (const entry of inserts) {
      const valuesBlock = extractValuesBlock(entry.sql);
      expect(valuesBlock).not.toBeNull();
      const placeholderCount = countPlaceholders(valuesBlock ?? '');
      expect(entry.params).toBeDefined();
      expect((entry.params ?? []).length).toBe(placeholderCount);
    }
  });

  it('skips seeding entirely when BOOTSTRAP_SEED_DATA is disabled', async () => {
    process.env.BOOTSTRAP_SEED_DATA = 'false';
    try {
      const { service, captured } = captureBootstrapQueries();
      await service.onModuleInit();
      expect(captured).toHaveLength(0);
    } finally {
      process.env.BOOTSTRAP_SEED_DATA = 'true';
    }
  });
});
