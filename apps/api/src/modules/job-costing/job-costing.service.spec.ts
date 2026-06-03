import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobCostingService } from './job-costing.service';

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Bea Bookkeeper',
      effectivePermissions: ['jobCosting:view', 'jobCosting:create', 'jobCosting:edit'],
      sessionSurface: 'office-web'
    })
  };
  const jobCostingRepository = {
    jobExists: jest.fn().mockResolvedValue(true),
    insertLabor: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    insertExpense: jest.fn().mockResolvedValue({ id: 'evt-2' }),
    getJobCosting: jest.fn()
  };

  return {
    service: new JobCostingService(identityAccessService as never, jobCostingRepository as never),
    identityAccessService,
    jobCostingRepository
  };
}

describe('JobCostingService.postLabor', () => {
  it('computes amount = hours * rate and inserts, gated office-only on jobCosting:create', async () => {
    const { service, identityAccessService, jobCostingRepository } = createService();

    await service.postLabor('token', 'job-1', {
      description: 'Diagnostic',
      hours: 1.5,
      ratePerHour: 90
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'jobCosting:create',
      ['office-web']
    );
    expect(jobCostingRepository.jobExists).toHaveBeenCalledWith('job-1');
    expect(jobCostingRepository.insertLabor).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        description: 'Diagnostic',
        hours: 1.5,
        ratePerHour: 90,
        amount: 135
      })
    );
  });

  it('rounds the labor cost to whole cents (half-up, float-noise absorbed)', async () => {
    const { service, jobCostingRepository } = createService();

    // 1.005 * 100 underflows in binary float; the cents helper must still round up to 100.50.
    await service.postLabor('token', 'job-1', {
      description: 'Tricky rounding',
      hours: 1,
      ratePerHour: 100.5
    });

    expect(jobCostingRepository.insertLabor).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100.5 })
    );
  });

  it('rejects non-positive hours and writes nothing', async () => {
    const { service, jobCostingRepository } = createService();

    await expect(
      service.postLabor('token', 'job-1', { description: 'x', hours: 0, ratePerHour: 90 })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(jobCostingRepository.insertLabor).not.toHaveBeenCalled();
  });

  it('rejects a negative labor rate and writes nothing', async () => {
    const { service, jobCostingRepository } = createService();

    await expect(
      service.postLabor('token', 'job-1', { description: 'x', hours: 1, ratePerHour: -5 })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(jobCostingRepository.insertLabor).not.toHaveBeenCalled();
  });

  it('rejects a blank-after-trim description and writes nothing', async () => {
    const { service, jobCostingRepository } = createService();

    await expect(
      service.postLabor('token', 'job-1', { description: '   ', hours: 1, ratePerHour: 90 })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(jobCostingRepository.insertLabor).not.toHaveBeenCalled();
  });

  it('throws NotFound when the job does not exist', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.jobExists.mockResolvedValue(false);

    await expect(
      service.postLabor('token', 'missing', { description: 'x', hours: 1, ratePerHour: 90 })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(jobCostingRepository.insertLabor).not.toHaveBeenCalled();
  });

  it('propagates a forbidden session and writes nothing', async () => {
    const { service, identityAccessService, jobCostingRepository } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());

    await expect(
      service.postLabor('token', 'job-1', { description: 'x', hours: 1, ratePerHour: 90 })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(jobCostingRepository.insertLabor).not.toHaveBeenCalled();
  });
});

describe('JobCostingService.postExpense', () => {
  it('inserts a positive expense', async () => {
    const { service, jobCostingRepository } = createService();

    await service.postExpense('token', 'job-1', { description: 'Permit fee', amount: 75 });

    expect(jobCostingRepository.insertExpense).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', description: 'Permit fee', amount: 75 })
    );
  });

  it('rejects a non-positive expense amount', async () => {
    const { service, jobCostingRepository } = createService();

    await expect(
      service.postExpense('token', 'job-1', { description: 'x', amount: 0 })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(jobCostingRepository.insertExpense).not.toHaveBeenCalled();
  });

  it('throws NotFound posting an expense to a missing job', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.jobExists.mockResolvedValue(false);

    await expect(
      service.postExpense('token', 'missing', { description: 'Permit', amount: 50 })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(jobCostingRepository.insertExpense).not.toHaveBeenCalled();
  });

  it('propagates a forbidden session and writes nothing', async () => {
    const { service, identityAccessService, jobCostingRepository } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());

    await expect(
      service.postExpense('token', 'job-1', { description: 'Permit', amount: 50 })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(jobCostingRepository.insertExpense).not.toHaveBeenCalled();
  });
});

describe('JobCostingService.getJobCosting', () => {
  it('returns the costing summary, gated office-only on jobCosting:view', async () => {
    const { service, identityAccessService, jobCostingRepository } = createService();
    const summary = {
      jobId: 'job-1',
      jobNumber: '1004',
      summary: 'No cooling',
      status: 'completed',
      live: { materialCost: 150, laborCost: 200, expenseCost: 50, totalCost: 400 },
      isFinalized: true
    };
    jobCostingRepository.getJobCosting.mockResolvedValue(summary);

    const result = await service.getJobCosting('token', 'job-1');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'jobCosting:view',
      ['office-web']
    );
    expect(result).toEqual({ costing: summary });
  });

  it('throws NotFound when the job does not exist', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.getJobCosting.mockResolvedValue(null);

    await expect(service.getJobCosting('token', 'missing')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
