import { ForbiddenException } from '@nestjs/common';
import { HistoryService } from './history.service';

type Row = {
  recordType: string;
  sourceId: string;
  occurredAt: Date;
  actorEmployeeId: string | null;
  actorName: string | null;
  detail: string;
  jobId: string | null;
};

function row(over: Partial<Row> = {}): Row {
  return {
    recordType: 'registerEntry',
    sourceId: 'r1',
    occurredAt: new Date('2026-06-05T00:00:00.000Z'),
    actorEmployeeId: 'tech-1',
    actorName: 'Tina Tech',
    detail: 'Capacitor',
    jobId: 'job-1',
    ...over
  };
}

function createService(rows: Row[] = []) {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'owner-1',
      effectivePermissions: ['history:view'],
      sessionSurface: 'office-web'
    })
  };
  const databaseService = { query: jest.fn().mockResolvedValue({ rows }) };
  return {
    service: new HistoryService(databaseService as never, identityAccessService as never),
    databaseService,
    identityAccessService
  };
}

describe('HistoryService', () => {
  it('authorizes history:view on the office surface', async () => {
    const { service, identityAccessService } = createService();
    await service.getHistory('token', {});
    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'history:view',
      ['office-web']
    );
  });

  it('rejects without the gate and never queries', async () => {
    const { service, identityAccessService, databaseService } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());
    await expect(service.getHistory('token', {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(databaseService.query).not.toHaveBeenCalled();
  });

  it('maps each source to a per-type summary and ISO timestamp', async () => {
    const { service } = createService([
      row({
        recordType: 'jobTimeline',
        detail: 'Job status changed to completed.',
        actorEmployeeId: null
      }),
      row({ recordType: 'registerEntry', detail: 'Capacitor' }),
      row({ recordType: 'inventoryMovement', detail: 'issueToJob' }),
      row({ recordType: 'jobCostEvent', detail: 'Travel time' }),
      row({ recordType: 'payment', detail: 'card', jobId: 'job-9' }),
      row({ recordType: 'equipmentHistory', detail: 'Filter replaced.', jobId: null })
    ]);
    const res = await service.getHistory('token', {});
    expect(res.entries.map((e) => e.summary)).toEqual([
      'Job status changed to completed.',
      'Register entry: Capacitor',
      'Inventory movement: issueToJob',
      'Job cost: Travel time',
      'Payment recorded (card)',
      'Filter replaced.'
    ]);
    expect(res.entries[0].occurredAt).toBe('2026-06-05T00:00:00.000Z');
    expect(res.entries[4].jobId).toBe('job-9');
    expect(res.entries[5].jobId).toBeNull();
  });

  it('unions all six sources and resolves payment jobs via the invoice join', async () => {
    const { service, databaseService } = createService();
    await service.getHistory('token', {});
    const [sql] = databaseService.query.mock.calls[0] as [string, unknown[]];
    for (const t of [
      'job_timeline_entries',
      'register_entries',
      'inventory_movements',
      'job_cost_events',
      'payments',
      'equipment_history_entries'
    ]) {
      expect(sql).toContain(t);
    }
    expect(sql).toContain('join invoices i on i.id = p.invoice_id');
  });

  it('applies every filter to the query', async () => {
    const { service, databaseService } = createService();
    await service.getHistory('token', {
      dateFrom: '2026-06-01T00:00:00.000Z',
      dateTo: '2026-06-30T00:00:00.000Z',
      actorEmployeeId: 'tech-1',
      recordType: 'payment',
      jobId: 'job-1'
    });
    const [sql, params] = databaseService.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('h.occurred_at >=');
    expect(sql).toContain('h.occurred_at <=');
    expect(sql).toContain('h.actor_employee_id =');
    expect(sql).toContain('h.record_type =');
    expect(sql).toContain('h.job_id =');
    expect(params).toEqual(
      expect.arrayContaining([
        '2026-06-01T00:00:00.000Z',
        '2026-06-30T00:00:00.000Z',
        'tech-1',
        'payment',
        'job-1'
      ])
    );
  });

  it('paginates: returns a cursor when an extra row exists and trims to the page size', async () => {
    const { service, databaseService } = createService([
      row({ sourceId: 'a' }),
      row({ sourceId: 'b' }),
      row({ sourceId: 'c' }) // the extra "limit + 1" row
    ]);
    const res = await service.getHistory('token', { limit: 2 });
    expect(res.entries).toHaveLength(2);
    expect(res.nextCursor).not.toBeNull();

    // limit + 1 is what the query fetched.
    const [, params] = databaseService.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBe(3);

    // The cursor points at the last row of the returned page (b), not the peeked row (c).
    const decoded = JSON.parse(Buffer.from(res.nextCursor as string, 'base64url').toString('utf8'));
    expect(decoded.s).toBe('b');
  });

  it('returns a null cursor when the page is not full', async () => {
    const { service } = createService([row({ sourceId: 'only' })]);
    const res = await service.getHistory('token', { limit: 2 });
    expect(res.nextCursor).toBeNull();
  });

  it('decodes a cursor into the keyset predicate', async () => {
    const cursor = Buffer.from(
      JSON.stringify({ o: '2026-06-05T00:00:00.000Z', r: 'registerEntry', s: 'b' }),
      'utf8'
    ).toString('base64url');
    const { service, databaseService } = createService();
    await service.getHistory('token', { cursor });
    const [sql, params] = databaseService.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('h.occurred_at <');
    expect(params).toEqual(
      expect.arrayContaining(['2026-06-05T00:00:00.000Z', 'registerEntry', 'b'])
    );
  });

  it('clamps an over-large limit to the server maximum', async () => {
    const { service, databaseService } = createService();
    await service.getHistory('token', { limit: 5000 });
    const [, params] = databaseService.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBe(201); // MAX_LIMIT (200) + 1
  });
});
