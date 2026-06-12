import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  relayAcceptanceDeclineReasonCodes,
  relayAcceptanceExpiryDays,
  type RelayAcceptanceDecisionRecord,
  type RelayAcceptanceDeclineReason,
  type RelayAcceptanceOptionInput,
  type RelayAcceptancePayload
} from '@bellfield/contracts';
import {
  generateAcceptanceToken,
  hashAcceptanceToken,
  isWellFormedAcceptanceToken
} from './acceptance-token.util';
import type { AcceptanceLinkRecord, AcceptanceLinksStore } from './acceptance.types';

export const ACCEPTANCE_LINKS_STORE = 'ACCEPTANCE_LINKS_STORE';
export const ACCEPTANCE_PUBLIC_BASE_URL = 'ACCEPTANCE_PUBLIC_BASE_URL';

export const homeownerNoteMaxLength = 500;

export type PreparedAcceptanceLink = {
  linkId: string;
  /** Plaintext token; never stored — lives only in the email and the minting response. */
  token: string;
  tokenHash: string;
  url: string;
};

export type AcceptancePageState =
  | { kind: 'notFound' }
  | { kind: 'superseded'; shopName: string }
  | { kind: 'expired'; shopName: string }
  | {
      kind: 'open';
      shopName: string;
      title: string;
      options: RelayAcceptanceOptionInput[];
    }
  | {
      kind: 'decided';
      shopName: string;
      title: string;
      decision: 'approved' | 'declined';
      selectedOptionLabel: string | null;
      decidedAt: Date;
    };

export type AcceptanceDecisionSubmission = {
  decision: 'approve' | 'decline';
  optionId?: string;
  declineReasons?: string[];
  note?: string;
};

export type AcceptanceDecisionOutcome =
  | { kind: 'recorded'; decision: 'approved' | 'declined' }
  | { kind: 'alreadySettled'; state: 'approved' | 'declined' | 'expired' | 'superseded' }
  | { kind: 'notFound' }
  | { kind: 'invalid'; message: string };

/**
 * The install sends its template with this placeholder; the relay must splice
 * because the URL does not exist until the link is minted in the same call.
 */
export const acceptanceLinkTemplateToken = '{acceptanceLink}';

export function spliceAcceptanceUrl(bodyText: string, url: string): string {
  if (bodyText.includes(acceptanceLinkTemplateToken)) {
    return bodyText.split(acceptanceLinkTemplateToken).join(url);
  }
  // Appended when the shop's template lacks the token, so an email can never
  // go out without its link. Copy is customer-facing.
  return `${bodyText}\n\nReview and respond to this estimate online:\n${url}`;
}

export function clampAcceptanceExpiryDays(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value)) {
    return relayAcceptanceExpiryDays.default;
  }
  return Math.min(relayAcceptanceExpiryDays.max, Math.max(relayAcceptanceExpiryDays.min, value));
}

@Injectable()
export class AcceptanceLinksService {
  constructor(
    @Inject(ACCEPTANCE_LINKS_STORE) private readonly store: AcceptanceLinksStore,
    @Inject(ACCEPTANCE_PUBLIC_BASE_URL) private readonly publicBaseUrl: string
  ) {}

  /** Pure token mint; persistence happens only after the message records as sent. */
  prepareLink(): PreparedAcceptanceLink {
    const generated = generateAcceptanceToken();
    return {
      linkId: randomUUID(),
      token: generated.token,
      tokenHash: generated.tokenHash,
      url: `${this.publicBaseUrl}/a/${generated.token}`
    };
  }

  async recordMintedLink(input: {
    prepared: PreparedAcceptanceLink;
    shopId: string;
    relayMessageId: string;
    acceptance: RelayAcceptancePayload;
    now: Date;
  }): Promise<void> {
    const expiryDays = clampAcceptanceExpiryDays(input.acceptance.expiresInDays);
    const expiresAt = new Date(input.now.getTime() + expiryDays * 24 * 60 * 60 * 1000);
    await this.store.recordLinkSupersedingOpen({
      id: input.prepared.linkId,
      shopId: input.shopId,
      relayMessageId: input.relayMessageId,
      tokenHash: input.prepared.tokenHash,
      estimateRef: input.acceptance.estimateRef,
      estimateVersion: input.acceptance.estimateVersion,
      title: input.acceptance.title,
      options: input.acceptance.options,
      expiresAt,
      createdAt: input.now
    });
  }

  async getPageState(token: string, now: Date): Promise<AcceptancePageState> {
    if (!isWellFormedAcceptanceToken(token)) {
      return { kind: 'notFound' };
    }
    const link = await this.store.findByTokenHash(hashAcceptanceToken(token));
    if (!link) {
      return { kind: 'notFound' };
    }
    if (link.status === 'superseded') {
      return { kind: 'superseded', shopName: link.shopDisplayName };
    }
    if (link.status === 'open') {
      if (link.expiresAt.getTime() <= now.getTime()) {
        return { kind: 'expired', shopName: link.shopDisplayName };
      }
      return {
        kind: 'open',
        shopName: link.shopDisplayName,
        title: link.title,
        options: link.options
      };
    }
    return {
      kind: 'decided',
      shopName: link.shopDisplayName,
      title: link.title,
      decision: link.status,
      selectedOptionLabel: resolveOptionLabel(link.options, link.decidedOptionId),
      decidedAt: link.decidedAt ?? link.createdAt
    };
  }

  async applyDecision(
    token: string,
    submission: AcceptanceDecisionSubmission,
    requesterIp: string | null,
    now: Date
  ): Promise<AcceptanceDecisionOutcome> {
    if (!isWellFormedAcceptanceToken(token)) {
      return { kind: 'notFound' };
    }
    const tokenHash = hashAcceptanceToken(token);
    const link = await this.store.findByTokenHash(tokenHash);
    if (!link) {
      return { kind: 'notFound' };
    }
    const settled = settledState(link, now);
    if (settled) {
      return { kind: 'alreadySettled', state: settled };
    }

    const note = normalizeNote(submission.note);
    if (note.kind === 'invalid') {
      return { kind: 'invalid', message: note.message };
    }

    let optionId: string | null = null;
    let declineReasons: RelayAcceptanceDeclineReason[] = [];
    if (submission.decision === 'approve') {
      if (submission.declineReasons && submission.declineReasons.length > 0) {
        return { kind: 'invalid', message: 'Decline reasons only apply when declining.' };
      }
      const resolved = resolveApprovedOption(link.options, submission.optionId);
      if (resolved.kind === 'invalid') {
        return { kind: 'invalid', message: resolved.message };
      }
      optionId = resolved.optionId;
    } else {
      if (submission.optionId !== undefined) {
        return { kind: 'invalid', message: 'An option choice only applies when approving.' };
      }
      const reasons = normalizeDeclineReasons(submission.declineReasons);
      if (reasons.kind === 'invalid') {
        return { kind: 'invalid', message: reasons.message };
      }
      declineReasons = reasons.reasons;
    }

    const decision = submission.decision === 'approve' ? 'approved' : 'declined';
    const updated = await this.store.applyDecision({
      tokenHash,
      decision,
      optionId,
      declineReasons,
      note: note.value,
      requesterIp,
      decidedAt: now
    });
    if (updated) {
      return { kind: 'recorded', decision };
    }
    // Lost a race (or crossed the expiry boundary) between the read and the
    // guarded update; report whatever actually settled the link.
    const current = await this.store.findByTokenHash(tokenHash);
    if (!current) {
      return { kind: 'notFound' };
    }
    return { kind: 'alreadySettled', state: settledState(current, now) ?? 'expired' };
  }

  async listUndeliveredDecisions(shopId: string): Promise<RelayAcceptanceDecisionRecord[]> {
    const links = await this.store.listUndeliveredDecisions(shopId);
    return links
      .filter(
        (link): link is AcceptanceLinkRecord & { decidedAt: Date } =>
          (link.status === 'approved' || link.status === 'declined') && link.decidedAt !== null
      )
      .map((link) => ({
        acceptanceLinkId: link.id,
        estimateRef: link.estimateRef,
        estimateVersion: link.estimateVersion,
        decision: link.status as 'approved' | 'declined',
        selectedOptionId: link.decidedOptionId,
        declineReasons: link.declineReasons,
        note: link.homeownerNote,
        decidedAt: link.decidedAt.toISOString()
      }));
  }

  async acknowledgeDecision(shopId: string, acceptanceLinkId: string, now: Date): Promise<boolean> {
    return this.store.acknowledgeDecision(shopId, acceptanceLinkId, now);
  }
}

function settledState(
  link: AcceptanceLinkRecord,
  now: Date
): 'approved' | 'declined' | 'expired' | 'superseded' | null {
  if (link.status === 'approved' || link.status === 'declined' || link.status === 'superseded') {
    return link.status;
  }
  if (link.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return null;
}

function resolveOptionLabel(
  options: RelayAcceptanceOptionInput[],
  optionId: string | null
): string | null {
  if (optionId === null) {
    return null;
  }
  return options.find((option) => option.id === optionId)?.label ?? null;
}

function resolveApprovedOption(
  options: RelayAcceptanceOptionInput[],
  optionId: string | undefined
): { kind: 'resolved'; optionId: string } | { kind: 'invalid'; message: string } {
  // A single-option estimate is the degenerate case: approving IS choosing it.
  if (optionId === undefined) {
    if (options.length === 1) {
      return { kind: 'resolved', optionId: options[0].id };
    }
    return { kind: 'invalid', message: 'Please choose an option to approve.' };
  }
  if (!options.some((option) => option.id === optionId)) {
    return { kind: 'invalid', message: 'That option is not part of this estimate.' };
  }
  return { kind: 'resolved', optionId };
}

function normalizeDeclineReasons(
  values: string[] | undefined
):
  | { kind: 'normalized'; reasons: RelayAcceptanceDeclineReason[] }
  | { kind: 'invalid'; message: string } {
  if (values === undefined || values.length === 0) {
    return { kind: 'normalized', reasons: [] };
  }
  const known = relayAcceptanceDeclineReasonCodes as readonly string[];
  if (values.some((value) => !known.includes(value))) {
    return { kind: 'invalid', message: 'An unknown decline reason was submitted.' };
  }
  return {
    kind: 'normalized',
    reasons: [...new Set(values)] as RelayAcceptanceDeclineReason[]
  };
}

function normalizeNote(
  value: string | undefined
): { kind: 'normalized'; value: string | null } | { kind: 'invalid'; message: string } {
  if (value === undefined) {
    return { kind: 'normalized', value: null };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { kind: 'normalized', value: null };
  }
  if (trimmed.length > homeownerNoteMaxLength) {
    return { kind: 'invalid', message: 'The note is too long.' };
  }
  return { kind: 'normalized', value: trimmed };
}
