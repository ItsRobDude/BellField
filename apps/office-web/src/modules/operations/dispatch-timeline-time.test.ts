import { describe, expect, it } from 'vitest';
import type { DispatchAppointmentSummary, JobStatus } from '@/lib/operations-api';
import {
  buildDispatchMoveDraft,
  buildDispatchReassignmentDraft,
  buildDispatchResizeDraft,
  clampDispatchMoveStartMinutes,
  clampDispatchResizeEndMinutes,
  formatDispatchMinutesAsTime,
  formatDispatchMovePreview,
  formatDispatchResizePreview,
  getDispatchMoveDurationMinutes,
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

  it('preserves duration and clamps moved appointments inside the visible day', () => {
    expect(getDispatchMoveDurationMinutes(8 * 60, 10 * 60, 18 * 60)).toBe(120);
    expect(getDispatchMoveDurationMinutes(8 * 60, null, 18 * 60)).toBe(90);
    expect(clampDispatchMoveStartMinutes(6 * 60 + 30, 120, 7 * 60, 18 * 60)).toBe(7 * 60);
    expect(clampDispatchMoveStartMinutes(17 * 60 + 30, 120, 7 * 60, 18 * 60)).toBe(16 * 60);
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

  it('builds a moved draft while preserving appointment duration and custom windows', () => {
    expect(formatDispatchMovePreview(9 * 60 + 15, 11 * 60 + 15)).toBe('9:15 AM - 11:15 AM');

    expect(buildDispatchMoveDraft(buildAppointment(), 9 * 60 + 15, 11 * 60 + 15)).toEqual({
      scheduledDate: '2026-05-22',
      scheduledStartTime: '09:15',
      scheduledEndTime: '11:15',
      timeWindowLabel: '9:15 AM - 11:15 AM',
      technicianId: 'tech-1'
    });

    expect(
      buildDispatchMoveDraft(
        buildAppointment({ timeWindowLabel: 'Customer asked for first call' }),
        9 * 60 + 15,
        11 * 60 + 15
      ).timeWindowLabel
    ).toBe('Customer asked for first call');
  });

  it('builds a reassignment draft while preserving schedule details exactly', () => {
    expect(
      buildDispatchReassignmentDraft(
        buildAppointment({
          scheduledDate: '2026-05-24',
          scheduledStartTime: undefined,
          scheduledEndTime: undefined,
          timeWindowLabel: 'First call'
        }),
        'tech-2'
      )
    ).toEqual({
      scheduledDate: '2026-05-24',
      scheduledStartTime: '',
      scheduledEndTime: '',
      timeWindowLabel: 'First call',
      technicianId: 'tech-2'
    });

    expect(buildDispatchReassignmentDraft(buildAppointment(), '').technicianId).toBe('');
  });
});
