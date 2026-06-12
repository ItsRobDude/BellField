import type { EstimateEmailDeliveryStatus, OutboundMessageSummary } from '@bellfield/contracts';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type EstimateDeliveryDraft = {
  recipientEmail: string;
  subject: string;
  bodyText: string;
};

export function EstimateDeliveryPanel({
  draft,
  deliveryStatus,
  history,
  isHistoryLoading,
  isPreviewLoading,
  isSending,
  cancelingMessageId,
  onChange,
  onSend,
  onCancelMessage
}: {
  draft: EstimateDeliveryDraft;
  deliveryStatus: EstimateEmailDeliveryStatus | null;
  history: OutboundMessageSummary[];
  isHistoryLoading: boolean;
  isPreviewLoading: boolean;
  isSending: boolean;
  cancelingMessageId: string | null;
  onChange: (patch: Partial<EstimateDeliveryDraft>) => void;
  onSend: () => void;
  onCancelMessage: (outboundMessageId: string) => void;
}) {
  const deliveryBlocked = deliveryStatus !== null && !deliveryStatus.ready;
  const recipientEmail = draft.recipientEmail.trim();
  const recipientLooksValid = /^\S+@\S+\.\S+$/.test(recipientEmail);
  const canSend = !isPreviewLoading && !deliveryBlocked && recipientLooksValid;

  return (
    <section style={styles.subpanel} aria-label="Estimate delivery">
      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          Recipient email
          <input
            aria-label="Estimate recipient email"
            type="email"
            value={draft.recipientEmail}
            onChange={(event) => onChange({ recipientEmail: event.target.value })}
            style={styles.input}
          />
          {recipientEmail === '' ? (
            <span style={styles.tinyMuted}>
              No email on file for this customer. Enter one to send.
            </span>
          ) : !recipientLooksValid ? (
            <span style={styles.error}>Enter a valid email address.</span>
          ) : null}
        </label>
        <label style={styles.fieldLabel}>
          Subject
          <input
            aria-label="Estimate email subject"
            value={draft.subject}
            onChange={(event) => onChange({ subject: event.target.value })}
            style={styles.input}
          />
        </label>
        <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
          Body
          <textarea
            aria-label="Estimate email body"
            value={draft.bodyText}
            onChange={(event) => onChange({ bodyText: event.target.value })}
            style={styles.textarea}
          />
        </label>
      </div>

      {isPreviewLoading ? <p style={styles.tinyMuted}>Loading send preview...</p> : null}
      {deliveryBlocked ? <p style={styles.error}>{deliveryStatus.message}</p> : null}

      <div style={styles.inlineActionBar}>
        <button
          type="button"
          style={styles.primaryButton}
          disabled={!canSend || isSending}
          onClick={onSend}
        >
          {isSending ? 'Sending...' : 'Send email'}
        </button>
      </div>
      <EstimateDeliveryHistory
        history={history}
        isLoading={isHistoryLoading}
        cancelingMessageId={cancelingMessageId}
        onCancelMessage={onCancelMessage}
      />
    </section>
  );
}

function EstimateDeliveryHistory({
  history,
  isLoading,
  cancelingMessageId,
  onCancelMessage
}: {
  history: OutboundMessageSummary[];
  isLoading: boolean;
  cancelingMessageId: string | null;
  onCancelMessage: (outboundMessageId: string) => void;
}) {
  if (isLoading) {
    return <p style={styles.tinyMuted}>Loading delivery history...</p>;
  }
  if (history.length === 0) {
    return <p style={styles.tinyMuted}>No sends recorded.</p>;
  }

  return (
    <div style={styles.listCompact} aria-label="Estimate delivery history">
      {history.map((message) => (
        <div key={message.id} style={styles.deliveryHistoryItem}>
          <div style={styles.row}>
            <span>
              To <strong>{message.recipientEmail}</strong>
            </span>
            <span style={message.status === 'failed' ? styles.dangerBadge : styles.badge}>
              {deliveryStatusLabel(message.status)}
            </span>
          </div>
          <span style={styles.tinyMuted}>
            {message.sentAt ? 'Sent' : 'Queued'}{' '}
            {formatDateTime(message.sentAt ?? message.queuedAt)}
            {' by '}
            {message.sentByName}
          </span>
          {message.status === 'queued' ? (
            <span style={styles.tinyMuted}>Will send automatically.</span>
          ) : null}
          {message.deliveryMessage ? (
            <span style={styles.tinyMuted}>{message.deliveryMessage}</span>
          ) : null}
          {message.status === 'queued' ? (
            <div>
              <button
                type="button"
                style={styles.button}
                disabled={cancelingMessageId === message.id}
                onClick={() => onCancelMessage(message.id)}
              >
                {cancelingMessageId === message.id ? 'Canceling...' : 'Cancel send'}
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function deliveryStatusLabel(status: OutboundMessageSummary['status']): string {
  if (status === 'sent') return 'Sent';
  if (status === 'failed') return 'Failed';
  if (status === 'canceled') return 'Canceled';
  if (status === 'delivered') return 'Delivered';
  if (status === 'bounced') return 'Bounced';
  if (status === 'complained') return 'Complaint';
  return 'Queued';
}
