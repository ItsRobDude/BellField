import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import type { PaymentRecord, RefundRecord } from './payments.types';

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
    listRefundsForJob: jest.fn().mockResolvedValue([]),
    refundPayment: jest.fn(),
    voidPayment: jest.fn()
  };
  const onlineRefundsRepository = {
    listForJob: jest.fn().mockResolvedValue([])
  };

  return {
    service: new PaymentsService(
      identityAccessService as never,
      jobsDataService as never,
      paymentsRepository as never,
      onlineRefundsRepository as never
    ),
    identityAccessService,
    jobsDataService,
    paymentsRepository,
    onlineRefundsRepository
  };
}

function paymentRecord(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'pay-1',
    jobId: 'job-1',
    invoiceId: 'inv-main',
    amount: 100,
    method: 'card',
    source: 'manual',
    currency: 'USD',
    receivedAt: '2026-06-02T00:00:00.000Z',
    recordedByEmployeeId: 'office-1',
    recordedByName: 'Bea Bookkeeper',
    allocations: [{ invoiceId: 'inv-main', invoiceKind: 'main', amount: 100 }],
    isVoid: false,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides
  };
}

function refundRecord(overrides: Partial<RefundRecord> = {}): RefundRecord {
  return {
    id: 'ref-1',
    paymentId: 'pay-1',
    jobId: 'job-1',
    amount: 50,
    method: 'card',
    source: 'bellfieldPayments',
    provider: 'stripe',
    currency: 'USD',
    refundedAt: '2026-06-15T01:00:00.000Z',
    recordedByName: 'BellField Payments',
    providerRefundId: 're_1',
    providerPaymentId: 'pi_1',
    allocations: [{ invoiceId: 'inv-main', invoiceKind: 'main', amount: 50 }],
    createdAt: '2026-06-15T01:00:00.000Z',
    updatedAt: '2026-06-15T01:00:00.000Z',
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

  it('maps pending/failed online refund requests with a derived submission state', async () => {
    const { service, paymentsRepository, onlineRefundsRepository } = createService();
    paymentsRepository.listPaymentsForJob.mockResolvedValue([]);
    onlineRefundsRepository.listForJob.mockResolvedValue([
      // Relay accepted (provider refund id present) → awaiting worker confirmation.
      {
        id: 'orr-1',
        paymentId: 'pay-1',
        amount: 30,
        currency: 'USD',
        status: 'requested',
        providerRefundId: 're_1',
        applyAttemptCount: 0,
        requestedAt: '2026-06-15T00:00:00.000Z'
      },
      // Never cleanly submitted (no provider refund id) → office can retry.
      {
        id: 'orr-2',
        paymentId: 'pay-2',
        amount: 40,
        currency: 'USD',
        status: 'requested',
        providerRefundId: null,
        applyAttemptCount: 0,
        requestedAt: '2026-06-15T00:05:00.000Z'
      },
      // Failed AFTER the worker tried to apply it (dead-letter): the money moved at
      // the processor but couldn't be recorded → recordingFailed, never re-request.
      {
        id: 'orr-3',
        paymentId: 'pay-3',
        amount: 50,
        currency: 'USD',
        status: 'failed',
        providerRefundId: 're_3',
        applyAttemptCount: 30,
        requestedAt: '2026-06-15T00:10:00.000Z'
      },
      // Failed with no apply attempts: a clean processor rejection → re-requestable.
      {
        id: 'orr-4',
        paymentId: 'pay-4',
        amount: 60,
        currency: 'USD',
        status: 'failed',
        providerRefundId: null,
        applyAttemptCount: 0,
        requestedAt: '2026-06-15T00:15:00.000Z'
      }
    ]);

    const result = await service.getJobPayments('token', 'job-1');

    expect(result.onlineRefundRequests).toEqual([
      {
        id: 'orr-1',
        paymentId: 'pay-1',
        amount: 30,
        currency: 'USD',
        status: 'requested',
        submissionState: 'submitted',
        requestedAt: '2026-06-15T00:00:00.000Z'
      },
      {
        id: 'orr-2',
        paymentId: 'pay-2',
        amount: 40,
        currency: 'USD',
        status: 'requested',
        submissionState: 'needsResubmit',
        requestedAt: '2026-06-15T00:05:00.000Z'
      },
      {
        id: 'orr-3',
        paymentId: 'pay-3',
        amount: 50,
        currency: 'USD',
        status: 'recordingFailed',
        submissionState: 'submitted',
        requestedAt: '2026-06-15T00:10:00.000Z'
      },
      {
        id: 'orr-4',
        paymentId: 'pay-4',
        amount: 60,
        currency: 'USD',
        status: 'failed',
        submissionState: 'needsResubmit',
        requestedAt: '2026-06-15T00:15:00.000Z'
      }
    ]);
  });

  it('hides clean failed online refund requests after confirmed refunds fully cover the payment', async () => {
    const { service, paymentsRepository, onlineRefundsRepository } = createService();
    paymentsRepository.listPaymentsForJob.mockResolvedValue([
      paymentRecord({
        id: 'pay-1',
        amount: 120,
        source: 'bellfieldPayments',
        provider: 'stripe',
        providerPaymentId: 'pi_1',
        providerSessionId: 'pay_sess_1'
      }),
      paymentRecord({
        id: 'pay-2',
        amount: 80,
        source: 'bellfieldPayments',
        provider: 'stripe',
        providerPaymentId: 'pi_2',
        providerSessionId: 'pay_sess_2'
      })
    ]);
    paymentsRepository.listRefundsForJob.mockResolvedValue([
      refundRecord({ id: 'ref-1', paymentId: 'pay-1', amount: 60 }),
      refundRecord({ id: 'ref-2', paymentId: 'pay-1', amount: 60 }),
      refundRecord({ id: 'ref-3', paymentId: 'pay-2', amount: 80 })
    ]);
    onlineRefundsRepository.listForJob.mockResolvedValue([
      {
        id: 'orr-clean-failed',
        paymentId: 'pay-1',
        amount: 60,
        currency: 'USD',
        status: 'failed',
        providerRefundId: null,
        applyAttemptCount: 0,
        requestedAt: '2026-06-15T00:15:00.000Z'
      },
      {
        id: 'orr-dead-letter',
        paymentId: 'pay-2',
        amount: 80,
        currency: 'USD',
        status: 'failed',
        providerRefundId: 're_dead_letter',
        applyAttemptCount: 30,
        requestedAt: '2026-06-15T00:20:00.000Z'
      }
    ]);

    const result = await service.getJobPayments('token', 'job-1');

    expect(result.onlineRefundRequests).toEqual([
      {
        id: 'orr-dead-letter',
        paymentId: 'pay-2',
        amount: 80,
        currency: 'USD',
        status: 'recordingFailed',
        submissionState: 'submitted',
        requestedAt: '2026-06-15T00:20:00.000Z'
      }
    ]);
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
    expect(paymentsRepository.voidPayment).toHaveBeenCalledWith(
      'pay-1',
      'entered twice',
      expect.objectContaining({ id: 'office-1', displayName: 'Bea Bookkeeper' })
    );
    expect(result.payment.isVoid).toBe(true);
  });
});

describe('PaymentsService.refundPayment', () => {
  it('refunds a payment gated on payments:refund and returns the refund', async () => {
    const { service, identityAccessService, paymentsRepository } = createService();
    paymentsRepository.refundPayment.mockResolvedValue({
      id: 'ref-1',
      paymentId: 'pay-1',
      jobId: 'job-1',
      amount: 40,
      method: 'card',
      source: 'manual',
      currency: 'USD',
      refundedAt: '2026-06-03T00:00:00.000Z',
      reason: 'overcharge',
      recordedByName: 'Bea Bookkeeper',
      allocations: [{ invoiceId: 'inv-main', invoiceKind: 'main', amount: 40 }],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z'
    });

    const result = await service.refundPayment('token', 'pay-1', {
      amount: 40,
      reason: 'overcharge'
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'payments:refund',
      ['office-web']
    );
    expect(paymentsRepository.refundPayment).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({
        amount: 40,
        reason: 'overcharge',
        actor: expect.objectContaining({ id: 'office-1', displayName: 'Bea Bookkeeper' })
      })
    );
    expect(result.refund.amount).toBe(40);
    expect(result.refund.paymentId).toBe('pay-1');
  });
});
