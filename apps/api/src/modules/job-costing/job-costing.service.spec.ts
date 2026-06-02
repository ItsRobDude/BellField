import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobCostingService } from './job-costing.service';

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Pat Purchaser',
      effectivePermissions: ['jobs:view', 'jobs:edit'],
      sessionSurface: 'office-web'
    })
  };
  const jobCostingRepository = {
    jobExists: jest.fn().mockResolvedValue(true),
    insertLabor: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    insertExpense: jest.fn().mockResolvedValue({ id: 'evt-2' })
  };

  return {
    service: new JobCostingService(identityAccessService as never, jobCostingRepository as never),
    identityAccessService,
    jobCostingRepository
  };
}

describe('JobCostingService.postLabor', () => {
  it('computes amount = hours * rate and inserts, gated office-only on jobs:edit', async () => {
    const { service, identityAccessService, jobCostingRepository } = createService();

    await service.postLabor('token', 'job-1', {
      description: 'Diagnostic',
      hours: 1.5,
      ratePerHour: 90
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith('token', 'jobs:edit', [
      'office-web'
    ]);
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

  it('rejects non-positive hours and writes nothing', async () => {
    const { service, jobCostingRepository } = createService();

    await expect(
      service.postLabor('token', 'job-1', { description: 'x', hours: 0, ratePerHour: 90 })
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
});
