import type { DispatchAppointmentCard } from './dispatch-board-data';
import type { DispatchScheduleDraft } from './dispatch-schedule-types';

export const dispatchResizeMinimumDurationMinutes = 30;
export const dispatchResizeDefaultDurationMinutes = 90;

export function parseDispatchTimeToMinutes(value?: string): number | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

export function formatDispatchMinutesAsTime(value: number): string {
  const clampedValue = Math.max(0, Math.min(value, 23 * 60 + 59));
  const hours = Math.floor(clampedValue / 60);
  const minutes = clampedValue % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function snapDispatchMinutes(value: number, slotMinutes: number): number {
  return Math.round(value / slotMinutes) * slotMinutes;
}

export function getDispatchResizeBaseEndMinutes(
  startMinutes: number,
  endMinutes: number | null,
  timelineEndMinutes: number
): number {
  const defaultEndMinutes = startMinutes + dispatchResizeDefaultDurationMinutes;
  const baseEndMinutes =
    endMinutes !== null && endMinutes > startMinutes ? endMinutes : defaultEndMinutes;

  return Math.min(baseEndMinutes, timelineEndMinutes);
}

export function getDispatchMoveDurationMinutes(
  startMinutes: number,
  endMinutes: number | null,
  timelineEndMinutes: number
): number {
  return (
    getDispatchResizeBaseEndMinutes(startMinutes, endMinutes, timelineEndMinutes) - startMinutes
  );
}

export function clampDispatchResizeEndMinutes(
  startMinutes: number,
  endMinutes: number,
  timelineEndMinutes: number
): number {
  const minimumEndMinutes = Math.min(
    startMinutes + dispatchResizeMinimumDurationMinutes,
    timelineEndMinutes
  );

  return Math.max(minimumEndMinutes, Math.min(endMinutes, timelineEndMinutes));
}

export function clampDispatchMoveStartMinutes(
  startMinutes: number,
  durationMinutes: number,
  timelineStartMinutes: number,
  timelineEndMinutes: number
): number {
  const visibleTimelineDuration = Math.max(0, timelineEndMinutes - timelineStartMinutes);
  const clampedDuration = Math.max(1, Math.min(durationMinutes, visibleTimelineDuration));
  const latestStartMinutes = Math.max(timelineStartMinutes, timelineEndMinutes - clampedDuration);

  return Math.max(timelineStartMinutes, Math.min(startMinutes, latestStartMinutes));
}

export function formatDispatchResizePreview(startMinutes: number, endMinutes: number): string {
  return `${formatDispatchPreviewTime(startMinutes)} - ${formatDispatchPreviewTime(endMinutes)}`;
}

export function formatDispatchMovePreview(startMinutes: number, endMinutes: number): string {
  return formatDispatchResizePreview(startMinutes, endMinutes);
}

export function buildDispatchResizeDraft(
  card: DispatchAppointmentCard,
  resizedEndMinutes: number
): DispatchScheduleDraft {
  const startMinutes = parseDispatchTimeToMinutes(card.scheduledStartTime);
  const currentEndMinutes = parseDispatchTimeToMinutes(card.scheduledEndTime);
  const resizedEndTime = formatDispatchMinutesAsTime(resizedEndMinutes);
  const currentWindowLabel = card.timeWindowLabel?.trim() ?? '';
  const oldStructuredWindow =
    startMinutes !== null && currentEndMinutes !== null
      ? formatDispatchResizePreview(startMinutes, currentEndMinutes)
      : '';
  const nextStructuredWindow =
    startMinutes !== null ? formatDispatchResizePreview(startMinutes, resizedEndMinutes) : '';

  return {
    scheduledDate: card.scheduledDate ?? '',
    scheduledStartTime: card.scheduledStartTime ?? '',
    scheduledEndTime: resizedEndTime,
    timeWindowLabel:
      !currentWindowLabel || currentWindowLabel === oldStructuredWindow
        ? nextStructuredWindow
        : currentWindowLabel,
    technicianId: card.technicianId ?? ''
  };
}

export function buildDispatchMoveDraft(
  card: DispatchAppointmentCard,
  movedStartMinutes: number,
  movedEndMinutes: number
): DispatchScheduleDraft {
  const startMinutes = parseDispatchTimeToMinutes(card.scheduledStartTime);
  const currentEndMinutes = parseDispatchTimeToMinutes(card.scheduledEndTime);
  const currentWindowLabel = card.timeWindowLabel?.trim() ?? '';
  const oldStructuredWindow =
    startMinutes !== null && currentEndMinutes !== null
      ? formatDispatchMovePreview(startMinutes, currentEndMinutes)
      : '';
  const nextStructuredWindow = formatDispatchMovePreview(movedStartMinutes, movedEndMinutes);

  return {
    scheduledDate: card.scheduledDate ?? '',
    scheduledStartTime: formatDispatchMinutesAsTime(movedStartMinutes),
    scheduledEndTime: formatDispatchMinutesAsTime(movedEndMinutes),
    timeWindowLabel:
      !currentWindowLabel || currentWindowLabel === oldStructuredWindow
        ? nextStructuredWindow
        : currentWindowLabel,
    technicianId: card.technicianId ?? ''
  };
}

export function buildDispatchReassignmentDraft(
  card: DispatchAppointmentCard,
  technicianId: string
): DispatchScheduleDraft {
  return {
    scheduledDate: card.scheduledDate ?? '',
    scheduledStartTime: card.scheduledStartTime ?? '',
    scheduledEndTime: card.scheduledEndTime ?? '',
    timeWindowLabel: card.timeWindowLabel ?? '',
    technicianId
  };
}

function formatDispatchPreviewTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
}
