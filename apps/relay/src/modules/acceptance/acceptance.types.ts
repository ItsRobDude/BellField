import type {
  RelayAcceptanceDeclineReason,
  RelayAcceptanceOptionInput
} from '@bellfield/contracts';

/**
 * 'expired' never appears in storage — it is computed from expires_at at read
 * time so no sweeper job is needed. Storage holds the other four states.
 */
export type AcceptanceLinkStoredStatus = 'open' | 'approved' | 'declined' | 'superseded';

export type AcceptanceLinkRecord = {
  id: string;
  shopId: string;
  relayMessageId: string;
  tokenHash: string;
  estimateRef: string;
  estimateVersion: number;
  title: string;
  options: RelayAcceptanceOptionInput[];
  status: AcceptanceLinkStoredStatus;
  decidedOptionId: string | null;
  declineReasons: RelayAcceptanceDeclineReason[];
  homeownerNote: string | null;
  decidedAt: Date | null;
  deliveredAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

/** Link joined with the shop display name the public page fronts. */
export type AcceptanceLinkWithShop = AcceptanceLinkRecord & {
  shopDisplayName: string;
};

export type RecordAcceptanceLinkInput = {
  id: string;
  shopId: string;
  relayMessageId: string;
  tokenHash: string;
  estimateRef: string;
  estimateVersion: number;
  title: string;
  options: RelayAcceptanceOptionInput[];
  expiresAt: Date;
  createdAt: Date;
};

export type ApplyDecisionInput = {
  tokenHash: string;
  decision: 'approved' | 'declined';
  optionId: string | null;
  declineReasons: RelayAcceptanceDeclineReason[];
  note: string | null;
  requesterIp: string | null;
  decidedAt: Date;
};

export interface AcceptanceLinksStore {
  /**
   * Inserts the new link and supersedes any prior open links for the same
   * shop + estimate in one transaction, so a resend atomically retires the
   * older email's link.
   */
  recordLinkSupersedingOpen(input: RecordAcceptanceLinkInput): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<AcceptanceLinkWithShop | null>;
  /**
   * First decision wins: updates only when the row is still open and unexpired,
   * returning the updated row or null when the link was already settled.
   */
  applyDecision(input: ApplyDecisionInput): Promise<AcceptanceLinkRecord | null>;
  listUndeliveredDecisions(shopId: string): Promise<AcceptanceLinkRecord[]>;
  /** Idempotent; returns false when the id is unknown for the shop or undecided. */
  acknowledgeDecision(
    shopId: string,
    acceptanceLinkId: string,
    deliveredAt: Date
  ): Promise<boolean>;
}
