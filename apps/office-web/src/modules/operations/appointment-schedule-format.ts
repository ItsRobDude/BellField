export type AppointmentScheduleDisplay = {
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
};

export function formatAppointmentScheduleDisplay(
  schedule: AppointmentScheduleDisplay,
  emptyLabel = 'Unscheduled'
): string {
  const timeDisplay = formatAppointmentScheduleTime(schedule);

  if (!schedule.scheduledDate && !timeDisplay) {
    return emptyLabel;
  }

  return [schedule.scheduledDate, timeDisplay].filter(Boolean).join(' - ');
}

export function formatAppointmentScheduleTime(
  schedule: AppointmentScheduleDisplay
): string | undefined {
  return (
    formatStructuredTimeRange(schedule.scheduledStartTime, schedule.scheduledEndTime) ??
    schedule.timeWindowLabel
  );
}

function formatStructuredTimeRange(startTime?: string, endTime?: string): string | undefined {
  if (startTime && endTime) {
    return `${formatLocalTime(startTime)} - ${formatLocalTime(endTime)}`;
  }

  if (startTime) {
    return `Starts ${formatLocalTime(startTime)}`;
  }

  if (endTime) {
    return `Ends ${formatLocalTime(endTime)}`;
  }

  return undefined;
}

function formatLocalTime(value: string): string {
  const [hourText, minute = '00'] = value.split(':');
  const hour = Number(hourText);

  if (!Number.isFinite(hour)) {
    return value;
  }

  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}
