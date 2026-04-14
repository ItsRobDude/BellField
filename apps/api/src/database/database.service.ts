import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getApiRuntimeConfig } from '../common/config/runtime-config';

export type QueryExecutor = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly runtimeConfig = getApiRuntimeConfig();
  private readonly pool = new Pool({
    connectionString: this.runtimeConfig.databaseUrl
  });

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(callback: (queryable: QueryExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing PostgreSQL pool.');
    await this.pool.end();
  }
}
