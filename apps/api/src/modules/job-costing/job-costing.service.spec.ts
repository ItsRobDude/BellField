import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
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
    getJobStatus: jest.fn().mockResolvedValue('inProgress'),
    insertLabor: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    insertExpense: jest.fn().mockResolvedValue({ id: 'evt-2' }),
    getJobCosting: jest.fn(),
    getById: jest.fn(),
    isEventReversed: jest.fn().mockResolvedValue(false),
    insertReversal: jest.fn().mockResolvedValue({ id: 'rev-1' })
  };
  const jobsDataService = {
    getRegisterEntryById: jest.fn(),
    resolveRegisterEntryCost: jest.fn().mockResolvedValue({ jobId: 'job-1' })
  };

  return {
    service: new JobCostingService(
      identityAccessService as never,
      jobCostingRepository as never,
      jobsDataService as never
    ),
    identityAccessService,
    jobCostingRepository,
    jobsDataService
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
    expect(jobCostingRepository.getJobStatus).toHaveBeenCalledWith('job-1');
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
    jobCostingRepository.getJobStatus.mockResolvedValue(null);

    await expect(
      service.postLabor('token', 'missing', { description: 'x', hours: 1, ratePerHour: 90 })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(jobCostingRepository.insertLabor).not.toHaveBeenCalled();
  });

  it('rejects labor on a completed (final) job — reopen required', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.getJobStatus.mockResolvedValue('completed');

    await expect(
      service.postLabor('token', 'job-1', { description: 'x', hours: 1, ratePerHour: 90 })
    ).rejects.toBeInstanceOf(ConflictException);
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
    jobCostingRepository.getJobStatus.mockResolvedValue(null);

    await expect(
      service.postExpense('token', 'missing', { description: 'Permit', amount: 50 })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(jobCostingRepository.insertExpense).not.toHaveBeenCalled();
  });

  it('rejects an expense on a final job — reopen required', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.getJobStatus.mockResolvedValue('closed');

    await expect(
      service.postExpense('token', 'job-1', { description: 'Permit', amount: 50 })
    ).rejects.toBeInstanceOf(ConflictException);
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

describe('JobCostingService.reverseEvent', () => {
  const laborEvent = {
    id: 'evt-1',
    jobId: 'job-1',
    kind: 'labor' as const,
    description: 'Install labor',
    amount: 190,
    hours: 2,
    ratePerHour: 95
  };

  it('posts the negation, carrying kind/provenance, gated on jobCosting:edit', async () => {
    const { service, identityAccessService, jobCostingRepository } = createService();
    jobCostingRepository.getById.mockResolvedValue(laborEvent);

    await service.reverseEvent('token', 'job-1', 'evt-1', { reason: 'Wrong rate' });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'jobCosting:edit',
      ['office-web']
    );
    expect(jobCostingRepository.insertReversal).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        kind: 'labor',
        amount: -190,
        hours: 2,
        ratePerHour: 95,
        reversalOfEventId: 'evt-1',
        description: 'Wrong rate'
      })
    );
  });

  it('defaults the reversal description from the original when no reason is given', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.getById.mockResolvedValue(laborEvent);

    await service.reverseEvent('token', 'job-1', 'evt-1', {});

    expect(jobCostingRepository.insertReversal).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Reversal of: Install labor' })
    );
  });

  it('reverses an expense with no labor provenance', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.getById.mockResolvedValue({
      id: 'evt-2',
      jobId: 'job-1',
      kind: 'expense',
      description: 'Permit',
      amount: 50,
      hours: undefined,
      ratePerHour: undefined
    });

    await service.reverseEvent('token', 'job-1', 'evt-2', {});

    expect(jobCostingRepository.insertReversal).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'expense', amount: -50, hours: null, ratePerHour: null })
    );
  });

  it('throws NotFound when the event belongs to a different job', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.getById.mockResolvedValue({ ...laborEvent, jobId: 'other-job' });

    await expect(service.reverseEvent('token', 'job-1', 'evt-1', {})).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(jobCostingRepository.insertReversal).not.toHaveBeenCalled();
  });

  it('refuses to reverse a reversal event', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.getById.mockResolvedValue({
      ...laborEvent,
      reversalOfEventId: 'evt-0'
    });

    await expect(service.reverseEvent('token', 'job-1', 'evt-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(jobCostingRepository.insertReversal).not.toHaveBeenCalled();
  });

  it('refuses to reverse on a final job — reopen required', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.getById.mockResolvedValue(laborEvent);
    jobCostingRepository.getJobStatus.mockResolvedValue('completed');

    await expect(service.reverseEvent('token', 'job-1', 'evt-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(jobCostingRepository.insertReversal).not.toHaveBeenCalled();
  });

  it('refuses to reverse an already-reversed event', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.getById.mockResolvedValue(laborEvent);
    jobCostingRepository.isEventReversed.mockResolvedValue(true);

    await expect(service.reverseEvent('token', 'job-1', 'evt-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(jobCostingRepository.insertReversal).not.toHaveBeenCalled();
  });

  it('translates a unique-violation race into a conflict', async () => {
    const { service, jobCostingRepository } = createService();
    jobCostingRepository.getById.mockResolvedValue(laborEvent);
    jobCostingRepository.insertReversal.mockRejectedValue({ code: '23505' });

    await expect(service.reverseEvent('token', 'job-1', 'evt-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
  });
});

describe('JobCostingService.resolveRegisterCost', () => {
  it('authorizes office cost-create, resolves the line, and returns refreshed costing', async () => {
    const { service, identityAccessService, jobCostingRepository, jobsDataService } =
      createService();
    jobsDataService.getRegisterEntryById.mockResolvedValue({ id: 're-1', jobId: 'job-1' });
    jobCostingRepository.getJobCosting.mockResolvedValue({ jobId: 'job-1' });

    const result = await service.resolveRegisterCost('token', 'job-1', 're-1', {
      mode: 'zeroCost'
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'jobCosting:create',
      ['office-web']
    );
    expect(jobsDataService.resolveRegisterEntryCost).toHaveBeenCalledWith(
      're-1',
      { mode: 'zeroCost' },
      { id: 'office-1', displayName: 'Bea Bookkeeper' }
    );
    expect(result).toEqual({ costing: { jobId: 'job-1' } });
  });

  it('rejects a register entry that belongs to a different job', async () => {
    const { service, jobsDataService } = createService();
    jobsDataService.getRegisterEntryById.mockResolvedValue({ id: 're-1', jobId: 'other-job' });

    await expect(
      service.resolveRegisterCost('token', 'job-1', 're-1', { mode: 'zeroCost' })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(jobsDataService.resolveRegisterEntryCost).not.toHaveBeenCalled();
  });
});
