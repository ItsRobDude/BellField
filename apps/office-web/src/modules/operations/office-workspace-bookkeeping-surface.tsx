'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  getOfficeBookkeepingQueues,
  type BookkeepingBalanceItem,
  type BookkeepingInvoiceItem,
  type BookkeepingPaymentBatchItem,
  type BookkeepingQueueKey,
  type BookkeepingQueuePaging,
  type BookkeepingQueuesResponse
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { formatCurrency } from './job-invoice-shared';

export type OfficeBookkeepingSurfaceProps = {
  apiBaseUrl: string;
  sessionToken: string;
  onOpenJob: (jobId: string) => void;
};

const correctionKindLabels: Record<BookkeepingInvoiceItem['invoiceKind'], string> = {
  main: 'Invoice',
  adjustment: 'Adjustment',
  credit: 'Credit'
};

// A read-only cross-job bookkeeping review surface: main drafts ready to post, jobs with
// an outstanding balance, recently posted invoices, and payment batches. Every row links
// back to the job's invoice tab, where the actual post/adjust/pay actions live behind
// their own permissions. Each worklist shows its true total and pages with "Load more".
// All styling reuses officeWorkspaceStyles.
export function OfficeBookkeepingSurface({
  apiBaseUrl,
  sessionToken,
  onOpenJob
}: OfficeBookkeepingSurfaceProps) {
  const [queues, setQueues] = useState<BookkeepingQueuesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMoreKeys, setLoadingMoreKeys] = useState<ReadonlySet<BookkeepingQueueKey>>(
    () => new Set()
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // A refresh replaces all four worklists, so a "Load more" page requested before it would
  // append rows the new first page already holds. Each request remembers which refresh it
  // belongs to and its result is dropped once a newer refresh has started.
  const refreshGenerationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const nextQueues = await getOfficeBookkeepingQueues({ apiBaseUrl, sessionToken });
      if (generation === refreshGenerationRef.current) {
        setQueues(nextQueues);
      }
    } catch (error) {
      if (generation === refreshGenerationRef.current) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load the bookkeeping worklists.'
        );
      }
    } finally {
      if (generation === refreshGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }, [apiBaseUrl, sessionToken]);

  const loadMore = useCallback(
    async (queueKey: BookkeepingQueueKey, cursor: string) => {
      const generation = refreshGenerationRef.current;
      setLoadingMoreKeys((current) => new Set(current).add(queueKey));
      setErrorMessage(null);
      try {
        const nextPage = await getOfficeBookkeepingQueues({
          apiBaseUrl,
          sessionToken,
          cursors: { [queueKey]: cursor }
        });
        if (generation === refreshGenerationRef.current) {
          setQueues((current) =>
            current ? appendBookkeepingQueuePage(current, nextPage, queueKey) : nextPage
          );
        }
      } catch (error) {
        if (generation === refreshGenerationRef.current) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to load more bookkeeping records.'
          );
        }
      } finally {
        setLoadingMoreKeys((current) => {
          const next = new Set(current);
          next.delete(queueKey);
          return next;
        });
      }
    },
    [apiBaseUrl, sessionToken]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section style={styles.workspacePanel} aria-label="Bookkeeping">
      <div style={styles.row}>
        <h1 style={styles.heading}>Bookkeeping</h1>
        <button
          type="button"
          style={styles.button}
          disabled={isLoading}
          onClick={() => void load()}
        >
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}

      {isLoading && !queues ? (
        <p style={styles.muted}>Loading worklists…</p>
      ) : queues ? (
        <>
          <QueuePanel
            title="Ready to post"
            emptyText="No drafts with billable lines are waiting to post."
            items={queues.readyToPost}
            paging={queues.paging.readyToPost}
            isLoadingMore={loadingMoreKeys.has('readyToPost')}
            isRefreshing={isLoading}
            onLoadMore={(cursor) => void loadMore('readyToPost', cursor)}
            renderItem={(item) => (
              <InvoiceRow key={item.invoiceId} item={item} onOpenJob={onOpenJob} />
            )}
          />
          <QueuePanel
            title="Open balances"
            emptyText="No jobs have an outstanding balance."
            items={queues.openBalance}
            paging={queues.paging.openBalance}
            isLoadingMore={loadingMoreKeys.has('openBalance')}
            isRefreshing={isLoading}
            onLoadMore={(cursor) => void loadMore('openBalance', cursor)}
            renderItem={(item) => <BalanceRow key={item.jobId} item={item} onOpenJob={onOpenJob} />}
          />
          <QueuePanel
            title="Recently posted"
            emptyText="No posted invoices yet."
            items={queues.recentlyPosted}
            paging={queues.paging.recentlyPosted}
            isLoadingMore={loadingMoreKeys.has('recentlyPosted')}
            isRefreshing={isLoading}
            onLoadMore={(cursor) => void loadMore('recentlyPosted', cursor)}
            renderItem={(item) => (
              <InvoiceRow key={item.invoiceId} item={item} onOpenJob={onOpenJob} />
            )}
          />
          <QueuePanel
            title="Payment batches"
            emptyText="No received payments are ready for deposit review."
            items={queues.paymentBatches}
            paging={queues.paging.paymentBatches}
            isLoadingMore={loadingMoreKeys.has('paymentBatches')}
            isRefreshing={isLoading}
            onLoadMore={(cursor) => void loadMore('paymentBatches', cursor)}
            renderItem={(item) => (
              <PaymentBatchRow key={`${item.batchDate}-${item.method}`} item={item} />
            )}
          />
        </>
      ) : null}
    </section>
  );
}

/**
 * Appends one worklist's next page to what is already shown and adopts its new paging
 * state. Rows already on screen are skipped: the worklists page on live sort keys (a
 * draft's last edit, a job's amount due), so a row that changed between two requests can
 * come back on the next page, and an accounting list must not show it twice.
 */
export function appendBookkeepingQueuePage(
  current: BookkeepingQueuesResponse,
  nextPage: BookkeepingQueuesResponse,
  queueKey: BookkeepingQueueKey
): BookkeepingQueuesResponse {
  const paging = { ...current.paging, [queueKey]: nextPage.paging[queueKey] };

  switch (queueKey) {
    case 'readyToPost':
      return {
        ...current,
        readyToPost: appendUnseen(current.readyToPost, nextPage.readyToPost, invoiceRowKey),
        paging
      };
    case 'openBalance':
      return {
        ...current,
        openBalance: appendUnseen(current.openBalance, nextPage.openBalance, balanceRowKey),
        paging
      };
    case 'recentlyPosted':
      return {
        ...current,
        recentlyPosted: appendUnseen(
          current.recentlyPosted,
          nextPage.recentlyPosted,
          invoiceRowKey
        ),
        paging
      };
    case 'paymentBatches':
      return {
        ...current,
        paymentBatches: appendUnseen(
          current.paymentBatches,
          nextPage.paymentBatches,
          paymentBatchRowKey
        ),
        paging
      };
  }
}

function appendUnseen<T>(shown: T[], nextPage: T[], keyOf: (item: T) => string): T[] {
  const shownKeys = new Set(shown.map(keyOf));
  return [...shown, ...nextPage.filter((item) => !shownKeys.has(keyOf(item)))];
}

function invoiceRowKey(item: BookkeepingInvoiceItem): string {
  return item.invoiceId;
}

function balanceRowKey(item: BookkeepingBalanceItem): string {
  return item.jobId;
}

function paymentBatchRowKey(item: BookkeepingPaymentBatchItem): string {
  return `${item.batchDate}-${item.method}`;
}

function QueuePanel<T>({
  title,
  emptyText,
  items,
  paging,
  isLoadingMore,
  isRefreshing,
  onLoadMore,
  renderItem
}: {
  title: string;
  emptyText: string;
  items: T[];
  paging: BookkeepingQueuePaging;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  onLoadMore: (cursor: string) => void;
  renderItem: (item: T) => ReactNode;
}) {
  const shownCount = items.length;
  const remainingCount = Math.max(0, paging.totalCount - shownCount);
  const countLabel = remainingCount > 0 ? `${shownCount} of ${paging.totalCount}` : `${shownCount}`;
  const nextCursor = paging.nextCursor;

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h2 style={styles.heading}>{title}</h2>
        <span style={styles.badge} aria-label={`${title}: ${countLabel}`}>
          {countLabel}
        </span>
      </div>
      {items.length === 0 ? (
        <p style={styles.muted}>{emptyText}</p>
      ) : (
        <div style={styles.list}>{items.map((item) => renderItem(item))}</div>
      )}
      {nextCursor ? (
        <button
          type="button"
          style={styles.button}
          disabled={isLoadingMore || isRefreshing}
          onClick={() => onLoadMore(nextCursor)}
        >
          {isLoadingMore ? 'Loading…' : `Load more (${remainingCount} remaining)`}
        </button>
      ) : null}
    </div>
  );
}

function InvoiceRow({
  item,
  onOpenJob
}: {
  item: BookkeepingInvoiceItem;
  onOpenJob: (jobId: string) => void;
}) {
  return (
    <button type="button" style={styles.cardButton} onClick={() => onOpenJob(item.jobId)}>
      <div style={styles.row}>
        <div style={{ minWidth: 0 }}>
          <strong>
            Job #{item.jobNumber} · {item.customerName}
          </strong>
          <p style={styles.tinyMuted}>
            {correctionKindLabels[item.invoiceKind]}
            {item.postedAt ? ` · posted ${item.postedAt.slice(0, 10)}` : ''}
          </p>
        </div>
        <strong>{formatCurrency(item.total)}</strong>
      </div>
    </button>
  );
}

function PaymentBatchRow({ item }: { item: BookkeepingPaymentBatchItem }) {
  return (
    <div style={styles.card}>
      <div style={styles.row}>
        <div style={{ minWidth: 0 }}>
          <strong>
            {item.batchDate} · {paymentMethodLabel(item.method)}
          </strong>
          <p style={styles.tinyMuted}>
            {item.paymentCount} payment{item.paymentCount === 1 ? '' : 's'} · latest{' '}
            {item.latestReceivedAt.slice(0, 10)}
          </p>
        </div>
        <strong>{formatCurrency(item.totalAmount)}</strong>
      </div>
    </div>
  );
}

function paymentMethodLabel(method: BookkeepingPaymentBatchItem['method']): string {
  if (method === 'ach') return 'ACH';
  return method.slice(0, 1).toUpperCase() + method.slice(1);
}

function BalanceRow({
  item,
  onOpenJob
}: {
  item: BookkeepingBalanceItem;
  onOpenJob: (jobId: string) => void;
}) {
  return (
    <button type="button" style={styles.cardButton} onClick={() => onOpenJob(item.jobId)}>
      <div style={styles.row}>
        <div style={{ minWidth: 0 }}>
          <strong>
            Job #{item.jobNumber} · {item.customerName}
          </strong>
          <p style={styles.tinyMuted}>
            Billed {formatCurrency(item.netBilled)} · paid {formatCurrency(item.paidTotal)}
          </p>
        </div>
        <strong>{formatCurrency(item.amountDue)} due</strong>
      </div>
    </button>
  );
}
