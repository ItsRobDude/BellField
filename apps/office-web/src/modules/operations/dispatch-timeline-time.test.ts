import { describe, expect, it } from 'vitest';
import type { DispatchAppointmentSummary, JobStatus } from '@/lib/operations-api';
import {
  buildDispatchResizeDraft,
  clampDispatchResizeEndMinutes,
  formatDispatchMinutesAsTime,
  formatDispatchResizePreview,
  getDispatchResizeBaseEndMinutes,
  parseDispatchTimeToMinutes,
  snapDispatchMinutes
} from './dispatch-timeline-time';

function buildAppointment(
  overrides: Partial<DispatchAppointmentSummary> = {}
): DispatchAppointmentSummary {
  return {
    appointmentId: 'appointment-1',
    jobId: 'job-1',
    jobNumber: '1001',
    jobSummary: 'No cooling',
    jobStatus: 'scheduled' as JobStatus,
    jobType: 'Service',
    status: 'scheduled',
    scheduledDate: '2026-05-22',
    scheduledStartTime: '08:00',
    scheduledEndTime: '10:00',
    timeWindowLabel: '',
    technicianId: 'tech-1',
    technicianName: 'Taylor Tech',
    locationId: 'location-1',
    locationName: 'Main Shop',
    locationAddressLine1: '123 Main',
    locationCity: 'Blaine',
    locationState: 'WA',
    billToCustomerId: 'customer-1',
    billToCustomerName: 'Acme',
    customerName: 'Acme',
    needsOfficeReview: false,
    equipment: [],
    equipmentCount: 0,
    ...overrides
  };
}

describe('dispatch timeline time helpers', () => {
  it('parses and formats structured dispatch times', () => {
    expect(parseDispatchTimeToMinutes('08:15')).toBe(495);
    expect(parseDispatchTimeToMinutes('24:00')).toBeNull();
    expect(parseDispatchTimeToMinutes('soon')).toBeNull();
    expect(formatDispatchMinutesAsTime(675)).toBe('11:15');
  });

  it('snaps and clamps resized end times to the visible dispatch day', () => {
    expect(snapDispatchMinutes(676, 15)).toBe(675);
    expect(snapDispatchMinutes(683, 15)).toBe(690);
    expect(clampDispatchResizeEndMinutes(8 * 60, 8 * 60 + 15, 18 * 60)).toBe(8 * 60 + 30);
    expect(clampDispatchResizeEndMinutes(17 * 60 + 45, 19 * 60, 18 * 60)).toBe(18 * 60);
  });

  it('uses a default visual end when the appointment has no structured end', () => {
    expect(getDispatchResizeBaseEndMinutes(8 * 60, null, 18 * 60)).toBe(9 * 60 + 30);
    expect(getDispatchResizeBaseEndMinutes(17 * 60, null, 18 * 60)).toBe(18 * 60);
  });

  it('builds a resized draft while preserving free-form windows', () => {
    expect(formatDispatchResizePreview(8 * 60, 11 * 60 + 15)).toBe('8:00 AM - 11:15 AM');

    expect(buildDispatchResizeDraft(buildAppointment(), 11 * 60 + 15)).toEqual({
      scheduledDate: '2026-05-22',
      scheduledStartTime: '08:00',
      scheduledEndTime: '11:15',
      timeWindowLabel: '8:00 AM - 11:15 AM',
      technicianId: 'tech-1'
    });

    expect(
      buildDispatchResizeDraft(
        buildAppointment({ timeWindowLabel: 'Customer asked for first call' }),
        11 * 60 + 15
      ).timeWindowLabel
    ).toBe('Customer asked for first call');
  });
});
