import { describe, expect, it } from 'vitest';
import type { DispatchAppointmentCard } from './dispatch-board-data';
import { buildDispatchTimelineLaneLayout } from './dispatch-timeline-lane-layout';

function buildCard(
  appointmentId: string,
  scheduledStartTime?: string,
  scheduledEndTime?: string
): DispatchAppointmentCard {
  return {
    appointmentId,
    jobId: `job-${appointmentId}`,
    jobNumber: appointmentId,
    jobSummary: 'No cooling',
    jobStatus: 'scheduled',
    jobType: 'Service',
    status: 'scheduled',
    scheduledDate: '2026-05-22',
    scheduledStartTime,
    scheduledEndTime,
    technicianId: 'tech-1',
    technicianName: 'Taylor Tech',
    locationId: `location-${appointmentId}`,
    locationName: 'Main Shop',
    locationAddressLine1: '123 Main',
    locationCity: 'Blaine',
    locationState: 'WA',
    customerName: 'Acme',
    billToCustomerName: 'Acme',
    needsOfficeReview: false,
    equipment: [],
    equipmentCount: 0
  };
}

describe('dispatch timeline lane layout', () => {
  it('places overlapping timed cards into separate stable lanes', () => {
    const layout = buildDispatchTimelineLaneLayout([
      buildCard('appt-1', '08:00', '10:00'),
      buildCard('appt-2', '09:30', '11:00')
    ]);

    expect(layout.timedLaneCount).toBe(2);
    expect(layout.rowCount).toBe(2);
    expect(layout.cardRows.get('appt-1')).toBe(1);
    expect(layout.cardRows.get('appt-2')).toBe(2);
  });

  it('reuses a lane for back-to-back timed cards', () => {
    const layout = buildDispatchTimelineLaneLayout([
      buildCard('appt-1', '08:00', '10:00'),
      buildCard('appt-2', '10:00', '11:00')
    ]);

    expect(layout.timedLaneCount).toBe(1);
    expect(layout.rowCount).toBe(1);
    expect(layout.cardRows.get('appt-1')).toBe(1);
    expect(layout.cardRows.get('appt-2')).toBe(1);
  });

  it('stacks untimed cards after timed lanes', () => {
    const layout = buildDispatchTimelineLaneLayout([
      buildCard('appt-1', '08:00', '10:00'),
      buildCard('untimed-1'),
      buildCard('untimed-2')
    ]);

    expect(layout.timedLaneCount).toBe(1);
    expect(layout.untimedRowCount).toBe(2);
    expect(layout.rowCount).toBe(3);
    expect(layout.cardRows.get('appt-1')).toBe(1);
    expect(layout.cardRows.get('untimed-1')).toBe(2);
    expect(layout.cardRows.get('untimed-2')).toBe(3);
  });

  it('uses drag preview timing when assigning lanes', () => {
    const layout = buildDispatchTimelineLaneLayout(
      [buildCard('appt-1', '08:00', '09:00'), buildCard('appt-2', '09:30', '10:30')],
      { appointmentId: 'appt-1', endMinutes: 10 * 60 }
    );

    expect(layout.timedLaneCount).toBe(2);
    expect(layout.cardRows.get('appt-1')).toBe(1);
    expect(layout.cardRows.get('appt-2')).toBe(2);
  });
});
