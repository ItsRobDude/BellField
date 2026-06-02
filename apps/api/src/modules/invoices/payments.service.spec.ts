import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import type { PaymentRecord } from './payments.types';

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Bea Bookkeeper',
      effectivePermissions: ['payments:view', 'payments:create', 'payments:edit'],
      sessionSurface: 'office-web'
    })
  };
  const jobsDataService = {
    getJobById: jest.fn().mockResolvedValue({ id: 'job-1', status: 'new' })
  };
  const paymentsRepository = {
    recordPayment: jest.fn(),
    listPaymentsForJob: jest.fn(),
    voidPayment: jest.fn()
  };

  return {
    service: new PaymentsService(
      identityAccessService as never,
      jobsDataService as never,
      paymentsRepository as never
    ),
    identityAccessService,
    jobsDataService,
    paymentsRepository
  };
}

function paymentRecord(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'pay-1',
    invoiceId: 'inv-main',
    amount: 100,
    method: 'card',
    receivedAt: '2026-06-02T00:00:00.000Z',
    recordedByEmployeeId: 'office-1',
    recordedByName: 'Bea Bookkeeper',
    isVoid: false,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides
  };
}

describe('PaymentsService.recordPayment', () => {
  it('records a payment gated office-only on payments:create and drops the internal employee id', async () => {
    const { service, identityAccessService, paymentsRepository } = createService();
    paymentsRepository.recordPayment.mockResolvedValue(paymentRecord());

    const result = await service.recordPayment('token', 'inv-main', {
      amount: 100,
      method: 'card'
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'payments:create',
      ['office-web']
    );
    expect(paymentsRepository.recordPayment).toHaveBeenCalledWith(
      'inv-main',
      expect.objectContaining({
        amount: 100,
        method: 'card',
        receivedAt: expect.any(String),
        actor: expect.objectContaining({ id: 'office-1' })
      })
    );
    expect(result.payment.recordedByName).toBe('Bea Bookkeeper');
    expect(result.payment).not.toHaveProperty('recordedByEmployeeId');
  });

  it('passes a caller-supplied receivedAt through unchanged', async () => {
    const { service, paymentsRepository } = createService();
    paymentsRepository.recordPayment.mockResolvedValue(paymentRecord());

    await service.recordPayment('token', 'inv-main', {
      amount: 50,
      method: 'check',
      receivedAt: '2026-05-30T12:00:00.000Z'
    });

    expect(paymentsRepository.recordPayment).toHaveBeenCalledWith(
      'inv-main',
      expect.objectContaining({ receivedAt: '2026-05-30T12:00:00.000Z' })
    );
  });

  it('propagates a forbidden session and records nothing', async () => {
    const { service, identityAccessService, paymentsRepository } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());

    await expect(
      service.recordPayment('token', 'inv-main', { amount: 100, method: 'card' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(paymentsRepository.recordPayment).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.getJobPayments', () => {
  it('lists payments gated on payments:view', async () => {
    const { service, identityAccessService, paymentsRepository } = createService();
    paymentsRepository.listPaymentsForJob.mockResolvedValue([
      paymentRecord(),
      paymentRecord({ id: 'pay-2', isVoid: true, voidReason: 'duplicate' })
    ]);

    const result = await service.getJobPayments('token', 'job-1');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'payments:view',
      ['office-web']
    );
    expect(result.payments).toHaveLength(2);
    expect(result.payments[1].isVoid).toBe(true);
  });

  it('throws NotFound for a missing job before listing', async () => {
    const { service, jobsDataService, paymentsRepository } = createService();
    jobsDataService.getJobById.mockRejectedValue(new NotFoundException('Job not found.'));

    await expect(service.getJobPayments('token', 'missing')).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(paymentsRepository.listPaymentsForJob).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.voidPayment', () => {
  it('voids a payment gated on payments:edit', async () => {
    const { service, identityAccessService, paymentsRepository } = createService();
    paymentsRepository.voidPayment.mockResolvedValue(
      paymentRecord({ isVoid: true, voidReason: 'entered twice' })
    );

    const result = await service.voidPayment('token', 'pay-1', { reason: 'entered twice' });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'payments:edit',
      ['office-web']
    );
    expect(paymentsRepository.voidPayment).toHaveBeenCalledWith('pay-1', 'entered twice');
    expect(result.payment.isVoid).toBe(true);
  });
});
