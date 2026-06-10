import { getAssignedWorkWindow } from './field-work-window';

describe('getAssignedWorkWindow', () => {
  it('keeps the assigned-work window on the server local calendar day late in the evening', () => {
    // Construct in server-local time: the contract is "the server's calendar
    // day," so a fixed-offset ISO string would only pass in one timezone.
    const referenceDate = new Date(2026, 3, 14, 23, 30, 0);

    const result = getAssignedWorkWindow(referenceDate);

    expect(result.windowStartDate).toBe('2026-04-14');
    expect(result.windowEndDate).toBe('2026-04-15');
    expect(result.allowedDates).toEqual(new Set(['2026-04-14', '2026-04-15']));
  });
});
