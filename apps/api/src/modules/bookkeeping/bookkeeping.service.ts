import { BadRequestException, Injectable } from '@nestjs/common';
import type { BookkeepingQueueKey, PaymentMethod } from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { BookkeepingRepository } from './bookkeeping.repository';
import type {
  BookkeepingQueuesRequestQuery,
  BookkeepingQueuesResponseDto,
  OpenBalanceCursor,
  PaymentBatchCursor,
  ReadyToPostCursor,
  RecentlyPostedCursor
} from './bookkeeping.types';

// Each worklist is paged so the review surface stays a fast, finite read. The response
// carries every worklist's true total and a next-page cursor, so a page boundary never
// hides an open balance the way a silent cap did.
const defaultQueueLimit = 50;
const maxQueueLimit = 200;
const paymentMethods: PaymentMethod[] = ['cash', 'check', 'card', 'ach', 'other'];

type PagedRows<T> = {
  items: T[];
  nextCursor?: string;
};

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
  async getInvoiceQueues(
    sessionToken: string,
    query: BookkeepingQueuesRequestQuery = { cursors: {} }
  ): Promise<BookkeepingQueuesResponseDto> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'invoices:view',
      ['office-web']
    );
    const canViewPayments = employee.effectivePermissions.includes('payments:view');
    const limit = this.parseLimit(query.limit);
    const readyToPostCursor = this.decodeCursor(
      query.cursors.readyToPost,
      'readyToPost',
      isReadyToPostCursor
    );
    const openBalanceCursor = this.decodeCursor(
      query.cursors.openBalance,
      'openBalance',
      isOpenBalanceCursor
    );
    const recentlyPostedCursor = this.decodeCursor(
      query.cursors.recentlyPosted,
      'recentlyPosted',
      isRecentlyPostedCursor
    );
    const paymentBatchesCursor = this.decodeCursor(
      query.cursors.paymentBatches,
      'paymentBatches',
      isPaymentBatchCursor
    );
    // One extra row per worklist tells us whether a next page exists without a second query.
    const pageLimit = limit + 1;

    const [
      readyToPostRows,
      readyToPostCount,
      openBalanceRows,
      openBalanceCount,
      recentlyPostedRows,
      recentlyPostedCount,
      paymentBatchRows,
      paymentBatchCount
    ] = await Promise.all([
      this.bookkeepingRepository.listReadyToPost({ limit: pageLimit, cursor: readyToPostCursor }),
      this.bookkeepingRepository.countReadyToPost(),
      this.bookkeepingRepository.listOpenBalances({ limit: pageLimit, cursor: openBalanceCursor }),
      this.bookkeepingRepository.countOpenBalances(),
      this.bookkeepingRepository.listRecentlyPosted({
        limit: pageLimit,
        cursor: recentlyPostedCursor
      }),
      this.bookkeepingRepository.countRecentlyPosted(),
      canViewPayments
        ? this.bookkeepingRepository.listPaymentBatches({
            limit: pageLimit,
            cursor: paymentBatchesCursor
          })
        : Promise.resolve([]),
      canViewPayments ? this.bookkeepingRepository.countPaymentBatches() : Promise.resolve(0)
    ]);

    const readyToPost = takePage(readyToPostRows, limit, (item) =>
      this.encodeCursor('readyToPost', { updatedAt: item.updatedAt, id: item.invoiceId })
    );
    const openBalance = takePage(openBalanceRows, limit, (item) =>
      this.encodeCursor('openBalance', { amountDue: item.amountDue, jobId: item.jobId })
    );
    const recentlyPosted = takePage(recentlyPostedRows, limit, (item) =>
      item.postedAt
        ? this.encodeCursor('recentlyPosted', { postedAt: item.postedAt, id: item.invoiceId })
        : undefined
    );
    const paymentBatches = takePage(paymentBatchRows, limit, (item) =>
      this.encodeCursor('paymentBatches', { batchDate: item.batchDate, method: item.method })
    );

    return {
      limit,
      readyToPost: readyToPost.items,
      openBalance: openBalance.items,
      recentlyPosted: recentlyPosted.items,
      paymentBatches: paymentBatches.items,
      paging: {
        readyToPost: { totalCount: readyToPostCount, nextCursor: readyToPost.nextCursor },
        openBalance: { totalCount: openBalanceCount, nextCursor: openBalance.nextCursor },
        recentlyPosted: { totalCount: recentlyPostedCount, nextCursor: recentlyPosted.nextCursor },
        paymentBatches: { totalCount: paymentBatchCount, nextCursor: paymentBatches.nextCursor }
      }
    };
  }

  private parseLimit(value: string | undefined): number {
    if (!value) {
      return defaultQueueLimit;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('limit must be a positive integer.');
    }

    if (parsed > maxQueueLimit) {
      throw new BadRequestException(`limit cannot exceed ${maxQueueLimit}.`);
    }

    return parsed;
  }

  private decodeCursor<TCursor>(
    value: string | undefined,
    queueKey: BookkeepingQueueKey,
    isCursor: (payload: Record<string, unknown>) => payload is Record<string, unknown> & TCursor
  ): TCursor | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
      // A cursor only means something for the worklist that minted it.
      if (!isRecord(decoded) || decoded.queue !== queueKey || !isCursor(decoded)) {
        throw new Error('Invalid cursor payload.');
      }

      return decoded;
    } catch {
      throw new BadRequestException(`${queueKey}Cursor is invalid.`);
    }
  }

  private encodeCursor(queueKey: BookkeepingQueueKey, payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify({ queue: queueKey, ...payload }), 'utf8').toString(
      'base64url'
    );
  }
}

function takePage<T>(
  rows: T[],
  limit: number,
  encodeCursor: (lastItem: T) => string | undefined
): PagedRows<T> {
  const items = rows.slice(0, limit);
  const lastItem = items[items.length - 1];

  return {
    items,
    nextCursor: rows.length > limit && lastItem ? encodeCursor(lastItem) : undefined
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(new Date(value).getTime());
}

function isReadyToPostCursor(
  payload: Record<string, unknown>
): payload is Record<string, unknown> & ReadyToPostCursor {
  return isTimestamp(payload.updatedAt) && isNonEmptyString(payload.id);
}

function isRecentlyPostedCursor(
  payload: Record<string, unknown>
): payload is Record<string, unknown> & RecentlyPostedCursor {
  return isTimestamp(payload.postedAt) && isNonEmptyString(payload.id);
}

function isOpenBalanceCursor(
  payload: Record<string, unknown>
): payload is Record<string, unknown> & OpenBalanceCursor {
  return (
    typeof payload.amountDue === 'number' &&
    Number.isFinite(payload.amountDue) &&
    isNonEmptyString(payload.jobId)
  );
}

function isPaymentBatchCursor(
  payload: Record<string, unknown>
): payload is Record<string, unknown> & PaymentBatchCursor {
  return (
    typeof payload.batchDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(payload.batchDate) &&
    typeof payload.method === 'string' &&
    paymentMethods.includes(payload.method as PaymentMethod)
  );
}
