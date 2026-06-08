import type { DispatchAppointmentCard } from './dispatch-board-data';
import { parseDispatchTimeToMinutes } from './dispatch-timeline-time';

export type DispatchTimeRange = {
  startMinutes: number;
  endMinutes: number;
};

export type DispatchOverlapLookup = Map<string, Set<string>>;

export function getDispatchCardTimeRange(
  card: Pick<DispatchAppointmentCard, 'scheduledStartTime' | 'scheduledEndTime'>
): DispatchTimeRange | null {
  const startMinutes = parseDispatchTimeToMinutes(card.scheduledStartTime);
  const endMinutes = parseDispatchTimeToMinutes(card.scheduledEndTime);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  return { startMinutes, endMinutes };
}

export function doDispatchTimeRangesOverlap(
  left: DispatchTimeRange,
  right: DispatchTimeRange
): boolean {
  return left.startMinutes < right.endMinutes && right.startMinutes < left.endMinutes;
}

export function buildDispatchOverlapLookup(
  cards: DispatchAppointmentCard[]
): DispatchOverlapLookup {
  const timedCards = cards
    .map((card) => ({ card, range: getDispatchCardTimeRange(card) }))
    .filter(
      (entry): entry is { card: DispatchAppointmentCard; range: DispatchTimeRange } =>
        entry.range !== null
    );
  const lookup: DispatchOverlapLookup = new Map();

  for (let leftIndex = 0; leftIndex < timedCards.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < timedCards.length; rightIndex += 1) {
      const left = timedCards[leftIndex];
      const right = timedCards[rightIndex];

      if (!left || !right || !doDispatchTimeRangesOverlap(left.range, right.range)) {
        continue;
      }

      addOverlap(lookup, left.card.appointmentId, right.card.appointmentId);
      addOverlap(lookup, right.card.appointmentId, left.card.appointmentId);
    }
  }

  return lookup;
}

export function hasDispatchOverlapWithCards(
  cards: DispatchAppointmentCard[],
  appointmentId: string,
  range: DispatchTimeRange | null
): boolean {
  if (!range) {
    return false;
  }

  return cards.some((card) => {
    if (card.appointmentId === appointmentId) {
      return false;
    }

    const cardRange = getDispatchCardTimeRange(card);

    return cardRange ? doDispatchTimeRangesOverlap(range, cardRange) : false;
  });
}

function addOverlap(lookup: DispatchOverlapLookup, appointmentId: string, overlapId: string) {
  const existing = lookup.get(appointmentId);

  if (existing) {
    existing.add(overlapId);
    return;
  }

  lookup.set(appointmentId, new Set([overlapId]));
}
