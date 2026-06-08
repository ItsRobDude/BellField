'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  getOfficeBookkeepingQueues,
  type BookkeepingBalanceItem,
  type BookkeepingInvoiceItem,
  type BookkeepingPaymentBatchItem,
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
// permissions. All styling reuses officeWorkspaceStyles.
export function OfficeBookkeepingSurface({
  apiBaseUrl,
  sessionToken,
  onOpenJob
}: OfficeBookkeepingSurfaceProps) {
  const [queues, setQueues] = useState<BookkeepingQueuesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
            renderItem={(item) => (
              <InvoiceRow key={item.invoiceId} item={item} onOpenJob={onOpenJob} />
            )}
          />
          <QueuePanel
            title="Open balances"
            emptyText="No jobs have an outstanding balance."
            items={queues.openBalance}
            renderItem={(item) => <BalanceRow key={item.jobId} item={item} onOpenJob={onOpenJob} />}
          />
          <QueuePanel
            title="Recently posted"
            emptyText="No posted invoices yet."
            items={queues.recentlyPosted}
            renderItem={(item) => (
              <InvoiceRow key={item.invoiceId} item={item} onOpenJob={onOpenJob} />
            )}
          />
          <QueuePanel
            title="Payment batches"
            emptyText="No received payments are ready for deposit review."
            items={queues.paymentBatches}
            renderItem={(item) => (
              <PaymentBatchRow key={`${item.batchDate}-${item.method}`} item={item} />
            )}
          />
        </>
      ) : null}
    </section>
  );
}

function QueuePanel<T>({
  title,
  emptyText,
  items,
  renderItem
}: {
  title: string;
  emptyText: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h2 style={styles.heading}>{title}</h2>
        <span style={styles.badge}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p style={styles.muted}>{emptyText}</p>
      ) : (
        <div style={styles.list}>{items.map((item) => renderItem(item))}</div>
      )}
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
