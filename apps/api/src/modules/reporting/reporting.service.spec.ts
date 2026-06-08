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

describe('ReportingService.exportArOpenBalances', () => {
  it('renders a CSV with a header row and a stamped filename', async () => {
    const { service } = createService(
      [
        row({
          jobNumber: '1003',
          customerName: 'Acme',
          netBilled: 100,
          paidTotal: 30,
          amountDue: 70
        })
      ],
      ['reports:view', 'invoices:view', 'reports:export']
    );
    const out = await service.exportArOpenBalances('token');
    expect(out.filename).toMatch(/^ar-open-balances-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = out.csv.split('\n');
    expect(lines[0]).toBe('Job #,Customer,Net billed,Paid,Amount due');
    expect(lines[1]).toBe('1003,Acme,100,30,70');
  });

  it('rejects 403 without reports:export (the permission is enforced server-side)', async () => {
    const { service, databaseService } = createService([], ['reports:view', 'invoices:view']);
    await expect(service.exportArOpenBalances('token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(databaseService.query).not.toHaveBeenCalled();
  });

  it('rejects 403 without the invoices:view view gate', async () => {
    const { service } = createService([], ['reports:view', 'reports:export']);
    await expect(service.exportArOpenBalances('token')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

type ProfitOpts = {
  perms?: string[];
  revenueRows?: Array<Record<string, unknown>>;
  snapshot?: Record<string, unknown> | null;
  inventoryMaterial?: number;
  events?: Array<{ kind: string; total: number }>;
  unresolvedCount?: number;
};

function createProfitService(opts: ProfitOpts = {}) {
  // Route each composed query by a keyword in its SQL so the per-job cost loop is modeled faithfully.
  const databaseService = {
    query: jest.fn((sql: string) => {
      if (sql.includes('job_cost_snapshots')) {
        return Promise.resolve({ rows: opts.snapshot ? [opts.snapshot] : [] });
      }
      if (sql.includes('having count(*) filter')) {
        return Promise.resolve({ rows: opts.revenueRows ?? [] });
      }
      if (sql.includes('inventory_movements')) {
        return Promise.resolve({ rows: [{ material: opts.inventoryMaterial ?? 0 }] });
      }
      if (sql.includes('job_cost_events')) {
        return Promise.resolve({ rows: opts.events ?? [] });
      }
      if (sql.includes('register_entries')) {
        return Promise.resolve({ rows: [{ count: opts.unresolvedCount ?? 0 }] });
      }
      return Promise.resolve({ rows: [] });
    })
  };
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'owner-1',
      effectivePermissions: opts.perms ?? ['reports:view', 'jobCosting:view'],
      sessionSurface: 'office-web'
    })
  };
  return {
    service: new ReportingService(databaseService as never, identityAccessService as never),
    databaseService,
    identityAccessService
  };
}

const revRow = (over: Record<string, unknown> = {}) => ({
  jobId: 'j1',
  jobNumber: '1003',
  customerName: 'Acme',
  status: 'inProgress',
  netBilled: 200,
  ...over
});

describe('ReportingService.getJobProfitability', () => {
  it('rejects 403 without jobCosting:view and never queries', async () => {
    const { service, databaseService } = createProfitService({ perms: ['reports:view'] });
    await expect(service.getJobProfitability('token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(databaseService.query).not.toHaveBeenCalled();
  });

  it('computes cost from the live rollup, profit, and margin for an unfinalized job', async () => {
    const { service } = createProfitService({
      revenueRows: [revRow({ netBilled: 200 })],
      snapshot: null,
      inventoryMaterial: 40,
      events: [{ kind: 'labor', total: 60 }],
      unresolvedCount: 0
    });
    const report = await service.getJobProfitability('token');
    const row = report.rows[0];
    expect(row).toMatchObject({
      revenue: 200,
      materialCost: 40,
      laborCost: 60,
      expenseCost: 0,
      totalCost: 100,
      profit: 100,
      marginBasisPoints: 5000, // (100/200) * 10000
      costComplete: true,
      isFinalized: false
    });
    expect(report.totals).toMatchObject({
      jobCount: 1,
      revenue: 200,
      knownCost: 100,
      knownProfit: 100,
      incompleteJobCount: 0,
      unresolvedLineCount: 0
    });
  });

  it('nulls the margin and flags incomplete cost when a line is unresolved', async () => {
    const { service } = createProfitService({
      revenueRows: [revRow({ netBilled: 100 })],
      snapshot: null,
      inventoryMaterial: 30,
      events: [{ kind: 'labor', total: 30 }],
      unresolvedCount: 2
    });
    const report = await service.getJobProfitability('token');
    expect(report.rows[0]).toMatchObject({
      costComplete: false,
      unresolvedLineCount: 2,
      marginBasisPoints: null
    });
    expect(report.totals.incompleteJobCount).toBe(1);
    expect(report.totals.unresolvedLineCount).toBe(2);
  });

  it('reads cost from the frozen snapshot for a finalized job', async () => {
    const { service } = createProfitService({
      revenueRows: [revRow({ status: 'closed', netBilled: 200 })],
      snapshot: {
        id: 's1',
        material: 30,
        labor: 20,
        expense: 0,
        total: 50,
        createdByName: 'Olivia',
        occurredAt: '2026-06-01T00:00:00.000Z'
      }
    });
    const report = await service.getJobProfitability('token');
    expect(report.rows[0]).toMatchObject({
      totalCost: 50,
      profit: 150,
      marginBasisPoints: 7500,
      costComplete: true,
      isFinalized: true,
      unresolvedLineCount: 0
    });
  });

  it('nulls the margin when revenue is zero (warranty / $0 posted invoice)', async () => {
    const { service } = createProfitService({
      revenueRows: [revRow({ netBilled: 0 })],
      snapshot: null,
      inventoryMaterial: 25,
      events: [],
      unresolvedCount: 0
    });
    const report = await service.getJobProfitability('token');
    expect(report.rows[0]).toMatchObject({
      revenue: 0,
      totalCost: 25,
      profit: -25,
      marginBasisPoints: null
    });
  });
});

describe('ReportingService.exportJobProfitability', () => {
  it('rejects 403 without reports:export', async () => {
    const { service } = createProfitService({ perms: ['reports:view', 'jobCosting:view'] });
    await expect(service.exportJobProfitability('token')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('renders a CSV with header + row when fully permitted', async () => {
    const { service } = createProfitService({
      perms: ['reports:view', 'jobCosting:view', 'reports:export'],
      revenueRows: [revRow({ netBilled: 200 })],
      snapshot: null,
      inventoryMaterial: 40,
      events: [{ kind: 'labor', total: 60 }],
      unresolvedCount: 0
    });
    const out = await service.exportJobProfitability('token');
    expect(out.filename).toMatch(/^job-profitability-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = out.csv.split('\n');
    expect(lines[0]).toBe(
      'Job #,Customer,Status,Revenue,Material,Labor,Expense,Total cost,Profit,Margin bps,Cost complete,Unresolved lines,Finalized'
    );
    expect(lines[1]).toBe('1003,Acme,inProgress,200,40,60,0,100,100,5000,yes,0,no');
  });
});

type OnHandDbRow = {
  itemId: string;
  itemName: string;
  itemKind: string;
  locationId: string;
  locationName: string;
  quantity: number;
  totalValue: number;
};

function createInventoryService(
  rows: OnHandDbRow[] = [],
  perms: string[] = ['reports:view', 'inventory:view']
) {
  const databaseService = { query: jest.fn().mockResolvedValue({ rows }) };
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'owner-1',
      effectivePermissions: perms,
      sessionSurface: 'office-web'
    })
  };
  return {
    service: new ReportingService(databaseService as never, identityAccessService as never),
    databaseService
  };
}

const onHandRow = (over: Partial<OnHandDbRow> = {}): OnHandDbRow => ({
  itemId: 'i1',
  itemName: 'Capacitor',
  itemKind: 'part',
  locationId: 'l1',
  locationName: 'Warehouse',
  quantity: 10,
  totalValue: 200,
  ...over
});

describe('ReportingService.getInventoryValuation', () => {
  it('rejects 403 without inventory:view and never queries', async () => {
    const { service, databaseService } = createInventoryService([], ['reports:view']);
    await expect(service.getInventoryValuation('token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(databaseService.query).not.toHaveBeenCalled();
  });

  it('computes weighted-average unit cost per row and sums totals', async () => {
    const { service } = createInventoryService([
      onHandRow({ itemId: 'i1', quantity: 10, totalValue: 200 }),
      onHandRow({ itemId: 'i2', itemName: 'Filter', quantity: 5, totalValue: 50 })
    ]);
    const report = await service.getInventoryValuation('token');
    expect(report.rows[0].averageUnitCost).toBe(20); // 200 / 10
    expect(report.rows[1].averageUnitCost).toBe(10); // 50 / 5
    expect(report.totals).toEqual({ rowCount: 2, totalQuantity: 15, totalValue: 250 });
  });
});

describe('ReportingService.exportInventoryValuation', () => {
  it('rejects 403 without reports:export', async () => {
    const { service } = createInventoryService([], ['reports:view', 'inventory:view']);
    await expect(service.exportInventoryValuation('token')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('renders a CSV with header + row when fully permitted', async () => {
    const { service } = createInventoryService(
      [onHandRow({ quantity: 10, totalValue: 200 })],
      ['reports:view', 'inventory:view', 'reports:export']
    );
    const out = await service.exportInventoryValuation('token');
    expect(out.filename).toMatch(/^inventory-valuation-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = out.csv.split('\n');
    expect(lines[0]).toBe('Item,Kind,Location,Quantity,Avg unit cost,Total value');
    expect(lines[1]).toBe('Capacitor,part,Warehouse,10,20,200');
  });
});

type AgreementReportDbRow = {
  agreementId: string;
  agreementNumber: string;
  customerId: string;
  customerName: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  billingCadence: string;
  nextBillingDate: string | null;
  billingAmount: string | null;
  coveredLocationNames: string[];
  coveredEquipmentCount: string;
  activeVisitTemplateCount: string;
  updatedAt: string;
  daysUntilBilling?: string;
};

function agreementRow(over: Partial<AgreementReportDbRow> = {}): AgreementReportDbRow {
  return {
    agreementId: 'agreement-1',
    agreementNumber: 'SA-1001',
    customerId: 'customer-1',
    customerName: 'Acme',
    name: 'Annual maintenance plan',
    status: 'active',
    startDate: '2026-01-01',
    endDate: null,
    renewalDate: '2026-07-01',
    billingCadence: 'annual',
    nextBillingDate: '2026-07-01',
    billingAmount: '240.00',
    coveredLocationNames: ['Main Shop'],
    coveredEquipmentCount: '2',
    activeVisitTemplateCount: '1',
    updatedAt: '2026-06-01T10:00:00.000Z',
    ...over
  };
}

function createAgreementReportService(perms = ['reports:view', 'agreements:view']) {
  const databaseService = {
    query: jest.fn((sql: string) => {
      if (sql.includes('active_service_agreements_report')) {
        return Promise.resolve({ rows: [agreementRow()] });
      }
      if (sql.includes('expiring_service_agreements_report')) {
        return Promise.resolve({ rows: [agreementRow({ agreementNumber: 'SA-1002' })] });
      }
      if (sql.includes('billing_due_service_agreements_report')) {
        return Promise.resolve({ rows: [agreementRow({ daysUntilBilling: '10' })] });
      }
      if (sql.includes('visit_template_service_agreements_report')) {
        return Promise.resolve({
          rows: [
            {
              agreementId: 'agreement-1',
              agreementNumber: 'SA-1001',
              customerId: 'customer-1',
              customerName: 'Acme',
              agreementName: 'Annual maintenance plan',
              templateId: 'template-1',
              title: 'Spring visit',
              frequency: 'annual',
              preferredMonth: 6,
              preferredDayOfMonth: 15,
              projectedDueDate: '2026-06-15',
              daysUntilProjectedDue: '7',
              timeWindowLabel: 'Morning',
              jobType: 'Maintenance',
              category: 'Recurring',
              summary: 'Annual check',
              estimatedDurationMinutes: 90,
              coveredLocationNames: ['Main Shop']
            }
          ]
        });
      }
      return Promise.resolve({ rows: [] });
    })
  };
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'owner-1',
      effectivePermissions: perms,
      sessionSurface: 'office-web'
    })
  };
  return {
    service: new ReportingService(databaseService as never, identityAccessService as never),
    databaseService
  };
}

describe('ReportingService.getServiceAgreementReports', () => {
  it('rejects 403 without agreements:view and never queries', async () => {
    const { service, databaseService } = createAgreementReportService(['reports:view']);
    await expect(service.getServiceAgreementReports('token')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(databaseService.query).not.toHaveBeenCalled();
  });

  it('builds agreement report totals and rows', async () => {
    const { service, databaseService } = createAgreementReportService();
    const report = await service.getServiceAgreementReports('token');

    expect(databaseService.query).toHaveBeenCalledTimes(4);
    expect(report.totals).toEqual({
      activeAgreementCount: 1,
      expiringSoonCount: 1,
      nextBillingDueCount: 1,
      visitTemplatePromptCount: 1
    });
    expect(report.activeAgreements[0]).toMatchObject({
      agreementNumber: 'SA-1001',
      billingAmount: 240,
      coveredEquipmentCount: 2,
      activeVisitTemplateCount: 1
    });
    expect(report.nextBillingDue[0]).toMatchObject({ daysUntilBilling: 10 });
    expect(report.visitTemplatePrompts[0]).toMatchObject({
      title: 'Spring visit',
      projectedDueDate: '2026-06-15',
      daysUntilProjectedDue: 7
    });
  });
});

describe('ReportingService service agreement CSV exports', () => {
  it('rejects 403 without reports:export', async () => {
    const { service } = createAgreementReportService(['reports:view', 'agreements:view']);
    await expect(service.exportActiveServiceAgreements('token')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('exports active agreements CSV when fully permitted', async () => {
    const { service } = createAgreementReportService([
      'reports:view',
      'agreements:view',
      'reports:export'
    ]);
    const out = await service.exportActiveServiceAgreements('token');
    const lines = out.csv.split('\n');

    expect(out.filename).toMatch(/^service-agreements-active-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(lines[0]).toBe(
      'Agreement #,Customer,Name,Renewal date,Billing cadence,Next billing date,Billing amount,Covered locations,Covered equipment count,Active visit templates'
    );
    expect(lines[1]).toBe(
      'SA-1001,Acme,Annual maintenance plan,2026-07-01,annual,2026-07-01,240,Main Shop,2,1'
    );
  });
});
