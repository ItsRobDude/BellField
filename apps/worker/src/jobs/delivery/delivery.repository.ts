import { randomUUID } from 'node:crypto';
import type { TransactionalQueryExecutor } from '../../common/database';
import type {
  AcceptanceApplyOutcome,
  AcceptanceDecision,
  AcceptancePayload,
  DeliveryStore,
  DeliveryTimelineEntry,
  DueQueuedDelivery,
  ExpiredDelivery,
  PollableDelivery
} from './delivery-types';

type DueRow = {
  id: string;
  job_id: string;
  recipient_email: string;
  subject: string;
  body_text: string;
  from_name: string | null;
  reply_to_email: string | null;
  sent_by_name: string;
  attempt_count: number;
  expires_at: Date | null;
  storage_path: string;
  sha256: string;
  filename: string;
  document_type: 'estimate' | 'invoice';
  document_title: string | null;
  acceptance_payload: AcceptancePayload | null;
};

type ExpiredRow = {
  id: string;
  job_id: string;
  recipient_email: string;
  sent_by_name: string;
  document_type: 'estimate' | 'invoice';
  document_title: string | null;
};

const dueQueuedClaimLeaseMs = 10 * 60 * 1000;

export class DeliveryRepository implements DeliveryStore {
  constructor(private readonly database: TransactionalQueryExecutor) {}

  async claimDueQueued(now: Date, limit: number): Promise<DueQueuedDelivery[]> {
    // next_attempt_at is set by a retryable failure. A queued row with no
    // next_attempt_at and an old queued_at is an interrupted synchronous send
    // (API crashed mid-flight); after a grace period the worker picks it up —
    // relay idempotency still protects a recovered send if the API died after
    // reaching the relay.
    //
    // Claiming pushes next_attempt_at into the near future before returning
    // rows, so another worker process cannot pick up the same send while this
    // process is reading the snapshot and calling the relay. If this process
    // dies mid-attempt, the row naturally becomes due again after the lease.
    const leaseUntil = new Date(now.getTime() + dueQueuedClaimLeaseMs);
    const result = await this.database.query<DueRow>(
      `
        update outbound_messages claimed
        set next_attempt_at = $3,
            updated_at = $1
        from (
          select om.id
          from outbound_messages om
          where om.status = 'queued'
            and (om.expires_at is null or om.expires_at > $1)
            and (
              (om.next_attempt_at is not null and om.next_attempt_at <= $1)
              or (om.next_attempt_at is null and om.queued_at <= $1::timestamptz - interval '10 minutes')
            )
          order by om.next_attempt_at asc nulls last
          limit $2
          for update skip locked
        ) due
        where claimed.id = due.id
        returning
          claimed.id, claimed.job_id, claimed.recipient_email, claimed.subject,
          claimed.body_text, claimed.from_name, claimed.reply_to_email,
          claimed.sent_by_name, claimed.attempt_count, claimed.expires_at,
          claimed.acceptance_payload,
          (select cds.storage_path
             from customer_document_snapshots cds
            where cds.id = claimed.document_snapshot_id) as storage_path,
          (select cds.sha256
             from customer_document_snapshots cds
            where cds.id = claimed.document_snapshot_id) as sha256,
          (select cds.filename
             from customer_document_snapshots cds
            where cds.id = claimed.document_snapshot_id) as filename,
          case when claimed.invoice_id is not null then 'invoice' else 'estimate' end as document_type,
          coalesce(
            (select title from estimates e where e.id = claimed.estimate_id),
            (select concat(
               case inv.invoice_kind
                 when 'adjustment' then 'Adjustment'
                 when 'credit' then 'Credit'
                 else 'Invoice'
               end,
               ' for job ',
               coalesce(inv.job_number, inv.id)
             ) from invoices inv where inv.id = claimed.invoice_id)
          ) as document_title
      `,
      [now, limit, leaseUntil]
    );
    return result.rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      bodyText: row.body_text,
      fromName: row.from_name,
      replyToEmail: row.reply_to_email,
      sentByName: row.sent_by_name,
      attemptCount: row.attempt_count,
      expiresAt: row.expires_at,
      documentType: row.document_type,
      documentTitle:
        row.document_title ?? (row.document_type === 'invoice' ? 'invoice' : 'estimate'),
      snapshotStoragePath: row.storage_path,
      snapshotSha256: row.sha256,
      snapshotFilename: row.filename,
      acceptancePayload: row.acceptance_payload
    }));
  }

  async markSent(
    id: string,
    providerMessageId: string | null,
    sentAt: Date,
    acceptance?: { linkId: string; url: string; expiresAt: Date }
  ): Promise<void> {
    await this.database.query(
      `
        update outbound_messages
        set status = 'sent',
            sent_at = $2,
            provider_message_id = $3,
            provider_error = null,
            attempt_count = attempt_count + 1,
            next_attempt_at = null,
            acceptance_link_id = coalesce($4, acceptance_link_id),
            acceptance_url = coalesce($5, acceptance_url),
            acceptance_link_expires_at = coalesce($6, acceptance_link_expires_at),
            updated_at = $2
        where id = $1 and status = 'queued'
      `,
      [
        id,
        sentAt,
        providerMessageId,
        acceptance?.linkId ?? null,
        acceptance?.url ?? null,
        acceptance?.expiresAt ?? null
      ]
    );
  }

  async markFailed(id: string, code: string, failedAt: Date): Promise<void> {
    await this.database.query(
      `
        update outbound_messages
        set status = 'failed',
            provider_error = $2,
            attempt_count = attempt_count + 1,
            next_attempt_at = null,
            updated_at = $3
        where id = $1 and status = 'queued'
      `,
      [id, code, failedAt]
    );
  }

  async scheduleRetry(id: string, nextAttemptAt: Date, occurredAt: Date): Promise<void> {
    await this.database.query(
      `
        update outbound_messages
        set attempt_count = attempt_count + 1,
            next_attempt_at = $2,
            updated_at = $3
        where id = $1 and status = 'queued'
      `,
      [id, nextAttemptAt, occurredAt]
    );
  }

  async expireDue(now: Date, legacyCutoff: Date): Promise<ExpiredDelivery[]> {
    const result = await this.database.query<ExpiredRow>(
      `
        update outbound_messages om
        set status = 'failed',
            provider_error = 'expired',
            next_attempt_at = null,
            updated_at = $1
        where om.status = 'queued'
          and (
            om.expires_at <= $1
            or (om.expires_at is null and om.queued_at <= $2)
          )
        returning om.id, om.job_id, om.recipient_email, om.sent_by_name,
          case when om.invoice_id is not null then 'invoice' else 'estimate' end as document_type,
          coalesce(
            (select title from estimates e where e.id = om.estimate_id),
            (select concat(
               case inv.invoice_kind
                 when 'adjustment' then 'Adjustment'
                 when 'credit' then 'Credit'
                 else 'Invoice'
               end,
               ' for job ',
               coalesce(inv.job_number, inv.id)
             ) from invoices inv where inv.id = om.invoice_id)
          ) as document_title
      `,
      [now, legacyCutoff]
    );
    return result.rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      documentType: row.document_type,
      documentTitle:
        row.document_title ?? (row.document_type === 'invoice' ? 'invoice' : 'estimate'),
      recipientEmail: row.recipient_email,
      sentByName: row.sent_by_name
    }));
  }

  async addTimelineEntry(entry: DeliveryTimelineEntry): Promise<void> {
    await this.database.query('update jobs set updated_at = $2 where id = $1', [
      entry.jobId,
      entry.occurredAt
    ]);
    await this.database.query(
      `
        insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), entry.jobId, entry.occurredAt, entry.actorName, entry.kind, entry.message]
    );
  }

  async listPollable(
    checkedBefore: Date,
    sentAfter: Date,
    limit: number
  ): Promise<PollableDelivery[]> {
    const result = await this.database.query<{ id: string; provider_message_id: string }>(
      `
        select id, provider_message_id
        from outbound_messages
        where status = 'sent'
          and provider = 'relay'
          and provider_message_id is not null
          and sent_at >= $2
          and (status_checked_at is null or status_checked_at <= $1)
        order by sent_at desc
        limit $3
      `,
      [checkedBefore, sentAfter, limit]
    );
    return result.rows.map((row) => ({ id: row.id, providerMessageId: row.provider_message_id }));
  }

  async applyDeliveryState(
    id: string,
    state: 'delivered' | 'bounced' | 'complained',
    at: Date
  ): Promise<boolean> {
    // Precedence guard mirrors the relay: delivered only advances from sent;
    // bounce/complaint advance from sent or delivered.
    const result = await this.database.query(
      `
        update outbound_messages
        set status = $2,
            status_checked_at = $3,
            updated_at = $3
        where id = $1
          and (case when $2 = 'delivered' then status = 'sent' else status in ('sent', 'delivered') end)
      `,
      [id, state, at]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async touchStatusChecked(id: string, at: Date): Promise<void> {
    await this.database.query(`update outbound_messages set status_checked_at = $2 where id = $1`, [
      id,
      at
    ]);
  }

  async applyAcceptanceDecision(
    decision: AcceptanceDecision,
    occurredAt: Date
  ): Promise<AcceptanceApplyOutcome> {
    return this.database.transaction(async (tx) => {
      // The outbound row is the dedupe ledger for at-least-once delivery:
      // locked first so a concurrent poller run waits, and a stamped
      // applied_at makes redelivery a no-op.
      const outboundResult = await tx.query<{
        id: string;
        acceptance_decision_applied_at: Date | null;
      }>(
        `select id, acceptance_decision_applied_at from outbound_messages
         where acceptance_link_id = $1
         for update`,
        [decision.acceptanceLinkId]
      );
      const outbound = outboundResult.rows[0];
      if (outbound?.acceptance_decision_applied_at) {
        return 'alreadyApplied';
      }
      const markApplied = async () => {
        if (outbound) {
          await tx.query(
            `update outbound_messages
             set acceptance_decision_applied_at = $2, updated_at = $2
             where id = $1`,
            [outbound.id, occurredAt]
          );
        }
      };

      const estimateResult = await tx.query<{
        id: string;
        job_id: string;
        title: string;
        status: string;
        version: number;
        option_groups: OptionGroupSnapshot[] | null;
      }>(
        `select id, job_id, title, status, version, option_groups
         from estimates where id = $1
         for update`,
        [decision.estimateRef]
      );
      const estimate = estimateResult.rows[0];
      if (!estimate) {
        await markApplied();
        return 'estimateMissing';
      }

      const addTimeline = async (kind: string, message: string) => {
        await tx.query('update jobs set updated_at = $2 where id = $1', [
          estimate.job_id,
          occurredAt
        ]);
        await tx.query(
          `insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
           values ($1, $2, $3, 'Customer', $4, $5)`,
          [randomUUID(), estimate.job_id, occurredAt, kind, message]
        );
      };

      const noteSuffix = decision.note ? ` Customer note: ${decision.note}` : '';
      const declineReasonCodes = normalizeDeclineReasons(decision.declineReasons);
      const reasonsText = formatDeclineReasons(declineReasonCodes);

      // Office action wins races: a settled estimate gets a note, no change.
      if (estimate.status !== 'pending') {
        await addTimeline(
          decision.decision === 'approved' ? 'estimateApproved' : 'estimateDeclined',
          `Customer also responded online (${decision.decision}) to ${estimate.title}, which was already settled in the office. No change was made.${noteSuffix}`
        );
        await markApplied();
        return 'alreadySettled';
      }

      // Version pinned at mint time: an edited estimate is never auto-approved
      // stale (the existing edited-since-sent honesty rule).
      if (estimate.version !== decision.estimateVersion) {
        await addTimeline(
          decision.decision === 'approved' ? 'estimateApproved' : 'estimateDeclined',
          `Customer ${decision.decision} an earlier version of ${estimate.title} online — review required before this takes effect.${noteSuffix}${reasonsText}`
        );
        await markApplied();
        return 'versionMismatch';
      }

      if (decision.decision === 'approved') {
        // The estimate-id sentinel means a non-optioned estimate: no option
        // selection, no totals change.
        const selectedOptionId =
          decision.selectedOptionId && decision.selectedOptionId !== estimate.id
            ? decision.selectedOptionId
            : null;
        const optionTotals = selectedOptionId
          ? findOptionTotals(estimate.option_groups, selectedOptionId)
          : null;
        const selectedLabel = selectedOptionId
          ? findOptionLabel(estimate.option_groups, selectedOptionId)
          : null;
        await tx.query(
          `update estimates
           set status = 'approved', approved_at = $2, approved_by_employee_id = null,
               approved_by_name = 'Customer',
               selected_option_id = coalesce($3, selected_option_id),
               subtotal_amount = coalesce($4, subtotal_amount),
               discount_amount_applied = coalesce($5, discount_amount_applied),
               taxable_base_amount = coalesce($6, taxable_base_amount),
               tax_amount = coalesce($7, tax_amount),
               total_amount = coalesce($8, total_amount),
               total_cost_amount = coalesce($9, total_cost_amount),
               profit_amount = coalesce($10, profit_amount),
               margin_basis_points = coalesce($11, margin_basis_points),
               cost_complete = coalesce($12, cost_complete),
               updated_at = $2, version = version + 1
           where id = $1 and status = 'pending'`,
          [
            estimate.id,
            occurredAt,
            selectedOptionId,
            optionTotals?.subtotal ?? null,
            optionTotals?.discount ?? null,
            optionTotals?.taxableBase ?? null,
            optionTotals?.tax ?? null,
            optionTotals?.total ?? null,
            optionTotals?.totalCost ?? null,
            optionTotals?.profit ?? null,
            optionTotals?.marginBasisPoints ?? null,
            optionTotals?.costComplete ?? null
          ]
        );
        await addTimeline(
          'estimateApproved',
          selectedLabel
            ? `Customer approved online: ${estimate.title} — ${selectedLabel}.${noteSuffix}`
            : `Customer approved online: ${estimate.title}.${noteSuffix}`
        );
      } else {
        await tx.query(
          `update estimates
           set status = 'declined', declined_at = $2, declined_by_employee_id = null,
               declined_by_name = 'Customer', decline_reason_codes = $3,
               updated_at = $2, version = version + 1
           where id = $1 and status = 'pending'`,
          [
            estimate.id,
            occurredAt,
            declineReasonCodes.length > 0 ? JSON.stringify(declineReasonCodes) : null
          ]
        );
        await addTimeline(
          'estimateDeclined',
          `Customer declined online: ${estimate.title}.${reasonsText}${noteSuffix}`
        );
      }
      await markApplied();
      return 'applied';
    });
  }
}

type OptionTotalsSnapshot = {
  subtotal: number;
  discount: number;
  taxableBase: number;
  tax: number;
  total: number;
  totalCost: number;
  profit: number;
  marginBasisPoints: number | null;
  costComplete: boolean;
};

type OptionGroupSnapshot = {
  options?: { id: string; label?: string; totals?: OptionTotalsSnapshot }[];
};

function findOptionTotals(
  groups: OptionGroupSnapshot[] | null,
  optionId: string
): OptionTotalsSnapshot | null {
  for (const group of groups ?? []) {
    const option = group.options?.find((candidate) => candidate.id === optionId);
    if (option?.totals) {
      return option.totals;
    }
  }
  return null;
}

function findOptionLabel(groups: OptionGroupSnapshot[] | null, optionId: string): string | null {
  for (const group of groups ?? []) {
    const option = group.options?.find((candidate) => candidate.id === optionId);
    if (option?.label) {
      return option.label;
    }
  }
  return null;
}

const declineReasonCodes = ['price', 'otherCompany', 'postponing', 'questions'] as const;

type DeclineReasonCode = (typeof declineReasonCodes)[number];

const declineReasonLabels: Record<DeclineReasonCode, string> = {
  price: 'Price',
  otherCompany: 'Going with another company',
  postponing: 'Not moving forward right now',
  questions: 'Has questions first'
};

function normalizeDeclineReasons(reasons: string[]): DeclineReasonCode[] {
  const normalized: DeclineReasonCode[] = [];
  for (const reason of reasons) {
    if (isDeclineReasonCode(reason) && !normalized.includes(reason)) {
      normalized.push(reason);
    }
  }
  return normalized;
}

function isDeclineReasonCode(reason: string): reason is DeclineReasonCode {
  return (declineReasonCodes as readonly string[]).includes(reason);
}

function formatDeclineReasons(reasons: DeclineReasonCode[]): string {
  if (reasons.length === 0) {
    return '';
  }
  const labels = reasons.map((reason) => declineReasonLabels[reason]);
  return ` Reasons: ${labels.join(', ')}.`;
}
