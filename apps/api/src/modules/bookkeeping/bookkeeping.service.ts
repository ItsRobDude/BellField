import { Injectable } from '@nestjs/common';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { BookkeepingRepository } from './bookkeeping.repository';
import type { BookkeepingQueuesResponseDto } from './bookkeeping.types';

// Each worklist is bounded so the review surface stays a fast, finite read rather than
// an unbounded report.
const QUEUE_LIMIT = 50;

@Injectable()
export class BookkeepingService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly bookkeepingRepository: BookkeepingRepository
  ) {}

  /**
   * The cross-job bookkeeping worklists. Office-only, gated on invoices:view — the same
   * authority that reads any invoice. Read-only: each item links back to its job, where
   * posting/adjustment/payment actions live behind their own permissions.
   */
  async getInvoiceQueues(sessionToken: string): Promise<BookkeepingQueuesResponseDto> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'invoices:view',
      ['office-web']
    );
    const canViewPayments = employee.effectivePermissions.includes('payments:view');

    const [readyToPost, openBalance, recentlyPosted, paymentBatches] = await Promise.all([
      this.bookkeepingRepository.listReadyToPost(QUEUE_LIMIT),
      this.bookkeepingRepository.listOpenBalances(QUEUE_LIMIT),
      this.bookkeepingRepository.listRecentlyPosted(QUEUE_LIMIT),
      canViewPayments
        ? this.bookkeepingRepository.listPaymentBatches(QUEUE_LIMIT)
        : Promise.resolve([])
    ]);

    return { readyToPost, openBalance, recentlyPosted, paymentBatches };
  }
}
