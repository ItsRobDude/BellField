'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
// an outstanding balance, and recently posted invoices. Every row links back to the
// job's invoice tab, where the actual post/adjust/pay actions live behind their own
// permissions. Each worklist is paged: the API reports its true total and "Load more"
// appends the next page, so a page boundary never hides an open balance. All styling
// reuses officeWorkspaceStyles.
export function OfficeBookkeepingSurface({
  apiBaseUrl,
  sessionToken,
  onOpenJob
}: OfficeBookkeepingSurfaceProps) {
  const [queues, setQueues] = useState<BookkeepingQueuesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMoreKey, setLoadingMoreKey] = useState<BookkeepingQueueKey | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setQueues(await getOfficeBookkeepingQueues({ apiBaseUrl, sessionToken }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load the bookkeeping worklists.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, sessionToken]);

  const loadMore = useCallback(
    async (queueKey: BookkeepingQueueKey, cursor: string) => {
      setLoadingMoreKey(queueKey);
      setErrorMessage(null);
      try {
        const nextPage = await getOfficeBookkeepingQueues({
          apiBaseUrl,
          sessionToken,
          cursors: { [queueKey]: cursor }
        });
        setQueues((current) =>
          current ? appendBookkeepingQueuePage(current, nextPage, queueKey) : nextPage
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load more bookkeeping records.'
        );
      } finally {
        setLoadingMoreKey(null);
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
            isLoadingMore={loadingMoreKey === 'readyToPost'}
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
            isLoadingMore={loadingMoreKey === 'openBalance'}
            onLoadMore={(cursor) => void loadMore('openBalance', cursor)}
            renderItem={(item) => <BalanceRow key={item.jobId} item={item} onOpenJob={onOpenJob} />}
          />
          <QueuePanel
            title="Recently posted"
            emptyText="No posted invoices yet."
            items={queues.recentlyPosted}
            paging={queues.paging.recentlyPosted}
            isLoadingMore={loadingMoreKey === 'recentlyPosted'}
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
            isLoadingMore={loadingMoreKey === 'paymentBatches'}
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

/** Appends one worklist's next page to what is already shown and adopts its new paging state. */
export function appendBookkeepingQueuePage(
  current: BookkeepingQueuesResponse,
  nextPage: BookkeepingQueuesResponse,
  queueKey: BookkeepingQueueKey
): BookkeepingQueuesResponse {
  const paging = { ...current.paging, [queueKey]: nextPage.paging[queueKey] };

  switch (queueKey) {
    case 'readyToPost':
      return { ...current, readyToPost: [...current.readyToPost, ...nextPage.readyToPost], paging };
    case 'openBalance':
      return { ...current, openBalance: [...current.openBalance, ...nextPage.openBalance], paging };
    case 'recentlyPosted':
      return {
        ...current,
        recentlyPosted: [...current.recentlyPosted, ...nextPage.recentlyPosted],
        paging
      };
    case 'paymentBatches':
      return {
        ...current,
        paymentBatches: [...current.paymentBatches, ...nextPage.paymentBatches],
        paging
      };
  }
}

function QueuePanel<T>({
  title,
  emptyText,
  items,
  paging,
  isLoadingMore,
  onLoadMore,
  renderItem
}: {
  title: string;
  emptyText: string;
  items: T[];
  paging: BookkeepingQueuePaging;
  isLoadingMore: boolean;
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
          disabled={isLoadingMore}
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
