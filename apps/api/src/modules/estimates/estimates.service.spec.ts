import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EstimatesService } from './estimates.service';
import type { EstimateRecord } from './estimates.types';

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: [
        'estimates:view',
        'estimates:create',
        'estimates:edit',
        'estimates:approve'
      ],
      sessionSurface: 'office-web'
    })
  };
  const jobsDataService = {
    getJobById: jest.fn().mockResolvedValue({ id: 'job-1', status: 'new' })
  };
  const estimatesRepository = {
    listEstimatesForJob: jest.fn().mockResolvedValue([]),
    getEstimateById: jest.fn(),
    createEstimate: jest.fn(),
    replaceEstimate: jest.fn(),
    approveEstimate: jest.fn(),
    declineEstimate: jest.fn()
  };

  return {
    service: new EstimatesService(
      identityAccessService as never,
      jobsDataService as never,
      estimatesRepository as never
    ),
    identityAccessService,
    jobsDataService,
    estimatesRepository
  };
}

function pendingEstimate(overrides: Partial<EstimateRecord> = {}): EstimateRecord {
  return {
    id: 'estimate-1',
    jobId: 'job-1',
    status: 'pending',
    title: 'AC replacement',
    taxRateBasisPoints: 0,
    lineItems: [
      {
        id: 'line-1',
        estimateId: 'estimate-1',
        position: 0,
        kind: 'equipment',
        description: 'Condenser',
        quantity: 1,
        unitPrice: 100,
        unitCost: 60,
        taxable: true,
        lineSubtotal: 100,
        lineCost: 60,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z'
      }
    ],
    totals: {
      subtotal: 100,
      discount: 0,
      taxableBase: 100,
      tax: 0,
      total: 100,
      totalCost: 60,
      profit: 40,
      marginBasisPoints: 4000,
      costComplete: true
    },
    createdByEmployeeId: 'office-1',
    createdByName: 'Dispatcher',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    version: 1,
    ...overrides
  };
}

describe('EstimatesService', () => {
  it('prices a created estimate through the shared engine and persists the snapshot', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.createEstimate.mockImplementation(async () => pendingEstimate());

    await service.createEstimate('token', 'job-1', {
      title: 'AC replacement',
      taxRateBasisPoints: 1000,
      lineItems: [
        {
          kind: 'equipment',
          description: 'Condenser',
          quantity: 1,
          unitPrice: 100,
          unitCost: 60,
          taxable: true
        }
      ]
    });

    expect(estimatesRepository.createEstimate).toHaveBeenCalledTimes(1);
    const [, writeInput] = estimatesRepository.createEstimate.mock.calls[0];
    // 10% tax on the taxable $100 line.
    expect(writeInput.totals.subtotal).toBe(100);
    expect(writeInput.totals.tax).toBe(10);
    expect(writeInput.totals.total).toBe(110);
    expect(writeInput.totals.profit).toBe(40);
    expect(writeInput.totals.marginBasisPoints).toBe(4000);
    expect(writeInput.lineTotals[0]).toEqual({ lineSubtotal: 100, lineCost: 60 });
  });

  it('rejects an estimate with no line items', async () => {
    const { service } = createService();
    await expect(
      service.createEstimate('token', 'job-1', { title: 'Empty', lineItems: [] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('surfaces an engine RangeError as a 400 rather than a 500', async () => {
    const { service } = createService();
    await expect(
      service.createEstimate('token', 'job-1', {
        title: 'Bad price',
        lineItems: [{ kind: 'part', description: 'X', quantity: 1, unitPrice: -5, taxable: true }]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to edit an approved estimate (strict lifecycle)', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate({ status: 'approved' }));

    await expect(
      service.updateEstimate('token', 'estimate-1', { title: 'Changed' })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(estimatesRepository.replaceEstimate).not.toHaveBeenCalled();
  });

  it('approves only a pending estimate and never mutates the job', async () => {
    const { service, estimatesRepository, jobsDataService } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate());
    estimatesRepository.approveEstimate.mockResolvedValue(pendingEstimate({ status: 'approved' }));

    const result = await service.approveEstimate('token', 'estimate-1');

    expect(result.estimate.status).toBe('approved');
    expect(estimatesRepository.approveEstimate).toHaveBeenCalledWith(
      'estimate-1',
      expect.any(Object)
    );
    // Invariant: approval has no downstream side-effects on the job.
    expect(jobsDataService.getJobById).not.toHaveBeenCalled();
  });

  it('refuses to approve an already-declined estimate', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(pendingEstimate({ status: 'declined' }));

    await expect(service.approveEstimate('token', 'estimate-1')).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('throws NotFound for a missing estimate', async () => {
    const { service, estimatesRepository } = createService();
    estimatesRepository.getEstimateById.mockResolvedValue(null);

    await expect(service.getEstimate('token', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
