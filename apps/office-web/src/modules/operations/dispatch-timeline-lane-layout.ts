import type { DispatchAppointmentCard } from './dispatch-board-data';
import { getDispatchCardTimeRange, type DispatchTimeRange } from './dispatch-overlap-utils';
import { parseDispatchTimeToMinutes } from './dispatch-timeline-time';

export type DispatchTimelineLanePreview = {
  appointmentId: string;
  startMinutes?: number;
  endMinutes?: number;
};

export type DispatchTimelineLaneLayout = {
  cardRows: Map<string, number>;
  rowCount: number;
  timedLaneCount: number;
  untimedRowCount: number;
};

type TimedLaneCard = {
  card: DispatchAppointmentCard;
  originalIndex: number;
  range: DispatchTimeRange;
};

type UntimedLaneCard = {
  card: DispatchAppointmentCard;
  originalIndex: number;
};

export function buildDispatchTimelineLaneLayout(
  cards: DispatchAppointmentCard[],
  preview?: DispatchTimelineLanePreview
): DispatchTimelineLaneLayout {
  const timedCards: TimedLaneCard[] = [];
  const untimedCards: UntimedLaneCard[] = [];

  cards.forEach((card, originalIndex) => {
    const range = getDispatchLaneCardRange(card, preview);

    if (range) {
      timedCards.push({ card, originalIndex, range });
      return;
    }

    untimedCards.push({ card, originalIndex });
  });

  timedCards.sort(compareTimedLaneCards);

  const laneEndMinutes: number[] = [];
  const cardRows = new Map<string, number>();

  timedCards.forEach((entry) => {
    const laneIndex = getFirstAvailableLaneIndex(laneEndMinutes, entry.range);

    laneEndMinutes[laneIndex] = entry.range.endMinutes;
    cardRows.set(entry.card.appointmentId, laneIndex + 1);
  });

  const timedLaneCount = laneEndMinutes.length;
  const untimedStartRow = timedLaneCount > 0 ? timedLaneCount + 1 : 1;

  untimedCards
    .sort((left, right) => left.originalIndex - right.originalIndex)
    .forEach((entry, index) => {
      cardRows.set(entry.card.appointmentId, untimedStartRow + index);
    });

  return {
    cardRows,
    rowCount: Math.max(1, timedLaneCount + untimedCards.length),
    timedLaneCount,
    untimedRowCount: untimedCards.length
  };
}

function getDispatchLaneCardRange(
  card: DispatchAppointmentCard,
  preview?: DispatchTimelineLanePreview
): DispatchTimeRange | null {
  if (preview?.appointmentId !== card.appointmentId) {
    return getDispatchCardTimeRange(card);
  }

  const currentRange = getDispatchCardTimeRange(card);
  const startMinutes =
    preview.startMinutes ??
    currentRange?.startMinutes ??
    parseDispatchTimeToMinutes(card.scheduledStartTime);
  const endMinutes =
    preview.endMinutes ??
    currentRange?.endMinutes ??
    parseDispatchTimeToMinutes(card.scheduledEndTime);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  return { startMinutes, endMinutes };
}

function compareTimedLaneCards(left: TimedLaneCard, right: TimedLaneCard): number {
  if (left.range.startMinutes !== right.range.startMinutes) {
    return left.range.startMinutes - right.range.startMinutes;
  }

  if (left.range.endMinutes !== right.range.endMinutes) {
    return left.range.endMinutes - right.range.endMinutes;
  }

  return left.originalIndex - right.originalIndex;
}

function getFirstAvailableLaneIndex(laneEndMinutes: number[], range: DispatchTimeRange): number {
  const availableLaneIndex = laneEndMinutes.findIndex(
    (endMinutes) => endMinutes <= range.startMinutes
  );

  return availableLaneIndex >= 0 ? availableLaneIndex : laneEndMinutes.length;
}
