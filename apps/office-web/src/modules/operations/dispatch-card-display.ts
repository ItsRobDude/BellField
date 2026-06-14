import type { DispatchAppointmentCard } from './dispatch-board-data';
import type { DispatchTimelineCardSpaceTier } from './dispatch-timeline-card';

type DispatchCardDetailOptions = {
  statusLabel: string;
  timeRangeText?: string | null;
};

type DispatchCardAriaOptions = {
  statusLabel: string;
  hasScheduleConflict: boolean;
};

export function formatDispatchCardAddress(card: DispatchAppointmentCard): string {
  const cityState = [card.locationCity, card.locationState]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');

  return [card.locationAddressLine1.trim(), cityState].filter(Boolean).join(', ');
}

export function formatDispatchCardPrimaryName(card: DispatchAppointmentCard): string {
  return firstPresent(card.customerName, card.locationName) ?? `Job ${card.jobNumber}`;
}

export function formatDispatchCardDetailLine(
  card: DispatchAppointmentCard,
  spaceTier: DispatchTimelineCardSpaceTier,
  options: DispatchCardDetailOptions
): string {
  const address = formatDispatchCardAddress(card);
  const locationName = formatDistinctLocationName(card);
  const jobType = card.jobType.trim();

  if (spaceTier === 'wide') {
    return joinDisplayParts([options.timeRangeText, options.statusLabel, jobType, address]);
  }

  if (spaceTier === 'narrow') {
    return firstPresent(jobType, address, locationName, options.statusLabel) ?? options.statusLabel;
  }

  return joinDisplayParts([jobType, locationName, address]) || options.statusLabel;
}

export function formatDispatchCardAriaLabel(
  card: DispatchAppointmentCard,
  options: DispatchCardAriaOptions
): string {
  const primaryName = formatDispatchCardPrimaryName(card);
  const locationName = formatDistinctLocationName(card);
  const address = formatDispatchCardAddress(card);

  return joinAriaParts([
    `Job ${card.jobNumber}`,
    primaryName,
    card.jobType,
    locationName,
    address,
    options.statusLabel,
    card.needsOfficeReview ? 'review needed' : null,
    options.hasScheduleConflict ? 'overlaps another appointment' : null
  ]);
}

function formatDistinctLocationName(card: DispatchAppointmentCard): string {
  const primaryName = formatDispatchCardPrimaryName(card);
  const locationName = card.locationName.trim();

  return locationName && locationName !== primaryName ? locationName : '';
}

function joinDisplayParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ');
}

function joinAriaParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

function firstPresent(...parts: Array<string | null | undefined>): string | null {
  return parts.map((part) => part?.trim()).find(Boolean) ?? null;
}
