export type AssignedWorkWindow = {
  windowStartDate: string;
  windowEndDate: string;
  allowedDates: Set<string>;
};

export function getAssignedWorkWindow(referenceDate: Date = new Date()): AssignedWorkWindow {
  const today = new Date(referenceDate);
  const tomorrow = new Date(referenceDate);
  tomorrow.setDate(today.getDate() + 1);

  const windowStartDate = formatLocalDate(today);
  const windowEndDate = formatLocalDate(tomorrow);

  return {
    windowStartDate,
    windowEndDate,
    allowedDates: new Set([windowStartDate, windowEndDate])
  };
}

export function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
