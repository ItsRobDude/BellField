import pg, { type QueryResult, type QueryResultRow } from 'pg';

const { Pool } = pg;

export type QueryExecutor = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>>;
};

export class WorkerDatabase implements QueryExecutor {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values as never[] | undefined);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
