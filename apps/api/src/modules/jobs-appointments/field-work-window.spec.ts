import { getAssignedWorkWindow } from './field-work-window';

describe('getAssignedWorkWindow', () => {
  it('keeps the assigned-work window on the server local calendar day late in the evening', () => {
    const referenceDate = new Date('2026-04-14T17:30:00-07:00');

    const result = getAssignedWorkWindow(referenceDate);

    expect(result.windowStartDate).toBe('2026-04-14');
    expect(result.windowEndDate).toBe('2026-04-15');
    expect(result.allowedDates).toEqual(new Set(['2026-04-14', '2026-04-15']));
  });
});
