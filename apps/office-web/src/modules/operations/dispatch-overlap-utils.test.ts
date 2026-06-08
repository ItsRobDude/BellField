import { describe, expect, it } from 'vitest';
import type { DispatchAppointmentCard } from './dispatch-board-data';
import {
  buildDispatchOverlapLookup,
  doDispatchTimeRangesOverlap,
  getDispatchCardTimeRange,
  hasDispatchOverlapWithCards
} from './dispatch-overlap-utils';

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

describe('dispatch overlap helpers', () => {
  it('detects appointments with overlapping structured start and end times', () => {
    const lookup = buildDispatchOverlapLookup([
      buildCard('appt-1', '08:00', '10:00'),
      buildCard('appt-2', '09:30', '11:00'),
      buildCard('appt-3', '12:00', '13:00')
    ]);

    expect(lookup.get('appt-1')).toEqual(new Set(['appt-2']));
    expect(lookup.get('appt-2')).toEqual(new Set(['appt-1']));
    expect(lookup.has('appt-3')).toBe(false);
  });

  it('treats back-to-back appointments as readable non-overlaps', () => {
    expect(
      doDispatchTimeRangesOverlap(
        { startMinutes: 8 * 60, endMinutes: 10 * 60 },
        { startMinutes: 10 * 60, endMinutes: 11 * 60 }
      )
    ).toBe(false);
  });

  it('ignores untimed and invalid structured ranges', () => {
    expect(getDispatchCardTimeRange(buildCard('missing-end', '08:00'))).toBeNull();
    expect(getDispatchCardTimeRange(buildCard('bad-order', '10:00', '09:00'))).toBeNull();
    expect(
      buildDispatchOverlapLookup([
        buildCard('appt-1', '08:00', '10:00'),
        buildCard('untimed', '09:00')
      ]).size
    ).toBe(0);
  });

  it('excludes the dragged appointment when checking a preview range', () => {
    const cards = [buildCard('appt-1', '08:00', '10:00'), buildCard('appt-2', '10:30', '12:00')];

    expect(
      hasDispatchOverlapWithCards(cards, 'appt-1', {
        startMinutes: 9 * 60,
        endMinutes: 11 * 60
      })
    ).toBe(true);
    expect(
      hasDispatchOverlapWithCards(cards, 'appt-1', {
        startMinutes: 8 * 60,
        endMinutes: 10 * 60
      })
    ).toBe(false);
  });
});
