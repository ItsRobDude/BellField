import { EstimatesRepository } from './estimates.repository';
import type { EstimateWriteInput } from './estimates.types';

type TestQueryable = {
  query: jest.Mock<Promise<{ rows: unknown[]; rowCount: number }>, [string, unknown[]]>;
};

describe('EstimatesRepository', () => {
  it('keeps the estimate line insert columns, values, and params aligned', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const repository = new EstimatesRepository({} as never);
    const queryable: TestQueryable = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [], rowCount: 1 };
      })
    };
    const input: EstimateWriteInput = {
      title: 'Smoke estimate',
      taxRateBasisPoints: 825,
      lineItems: [
        {
          kind: 'serviceItem',
          description: 'Diagnostic',
          quantity: 1,
          unitPrice: 42.5,
          unitCost: 10,
          taxable: true
        }
      ],
      totals: {
        subtotal: 42.5,
        discount: 0,
        taxableBase: 42.5,
        tax: 3.51,
        total: 46.01,
        totalCost: 10,
        profit: 32.5,
        marginBasisPoints: 7647,
        costComplete: true
      },
      lineTotals: [{ lineSubtotal: 42.5, lineCost: 10 }]
    };

    await (
      repository as unknown as {
        insertLineItems: (
          queryable: TestQueryable,
          estimateId: string,
          input: EstimateWriteInput,
          now: string
        ) => Promise<void>;
      }
    ).insertLineItems(queryable, 'estimate-1', input, '2026-06-09T00:00:00.000Z');

    const insert = queries[0];
    expect(insert).toBeDefined();
    expect(insert.params).toHaveLength(19);
    expect(insert.sql).not.toContain('$20');
    expect(insert.sql).toContain('$19, $19');
    expect(countInsertTargets(insert.sql)).toBe(countInsertValues(insert.sql));
  });
});

function countInsertTargets(sql: string): number {
  const match = sql.match(/insert into estimate_line_items\s*\(([\s\S]*?)\)\s*values/i);
  if (!match) {
    throw new Error('Unable to find estimate_line_items target list.');
  }
  return match[1].split(',').length;
}

function countInsertValues(sql: string): number {
  const match = sql.match(/values\s*\(([\s\S]*?)\)/i);
  if (!match) {
    throw new Error('Unable to find estimate_line_items value list.');
  }
  return match[1].split(',').length;
}
