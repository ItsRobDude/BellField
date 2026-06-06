import { ForbiddenException } from '@nestjs/common';
import { ReportingService } from './reporting.service';

type DbRow = {
  jobId: string;
  jobNumber: string;
  customerName: string;
  netBilled: number;
  paidTotal: number;
  amountDue: number;
};

function createService(rows: DbRow[] = [], perms: string[] = ['reports:view', 'invoices:view']) {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'owner-1',
      effectivePermissions: perms,
      sessionSurface: 'office-web'
    })
  };
  const databaseService = { query: jest.fn().mockResolvedValue({ rows }) };
  return {
    service: new ReportingService(databaseService as never, identityAccessService as never),
    databaseService,
    identityAccessService
  };
}

const row = (over: Partial<DbRow> = {}): DbRow => ({
  jobId: 'job-1',
  jobNumber: '1003',
  customerName: 'Acme',
  netBilled: 100,
  paidTotal: 30,
  amountDue: 70,
  ...over
});

describe('ReportingService.getArOpenBalances', () => {
  it('authorizes reports:view on the office surface', async () => {
    const { service, identityAccessService } = createService();
    await service.getArOpenBalances('token');
    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'reports:view',
      ['office-web']
    );
  });

  it('rejects 403 without the invoices:view secondary gate and never queries', async () => {
    const { service, databaseService } = createService([], ['reports:view']); // no invoices:view
    await expect(service.getArOpenBalances('token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(databaseService.query).not.toHaveBeenCalled();
  });

  it('sums totals across the open-balance rows', async () => {
    const { service } = createService([
      row({ jobId: 'a', netBilled: 100, paidTotal: 30, amountDue: 70 }),
      row({ jobId: 'b', netBilled: 50, paidTotal: 0, amountDue: 50 })
    ]);
    const report = await service.getArOpenBalances('token');
    expect(report.totals).toEqual({ jobCount: 2, netBilled: 150, paidTotal: 30, amountDue: 120 });
    expect(report.rows).toHaveLength(2);
    expect(typeof report.generatedAt).toBe('string');
  });

  it('reuses the open-balance calculation un-limited (full AR, not a top-N worklist)', async () => {
    const { service, databaseService } = createService([row()]);
    await service.getArOpenBalances('token');
    const [sql, params] = databaseService.query.mock.calls[0] as [string, unknown[]];
    // The report wants every open job, so no LIMIT and no limit param.
    expect(sql).not.toMatch(/limit/i);
    expect(params).toEqual([]);
    // And it is the same shared CTE (single source of truth).
    expect(sql).toContain("invoice_kind in ('main', 'adjustment')");
    expect(sql).toContain('p.is_void = false');
  });
});
