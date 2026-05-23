import { describe, expect, it } from 'vitest';
import type { FieldAssignedWorkResponse } from '@/lib/operations-api';
import type { PendingOperation } from '../field-sync-types';
import {
  formatAppointmentSchedule,
  formatFieldLocationAddress,
  formatFinishedReviewAcknowledgement,
  formatWorkOrderLine,
  summarizeAppointmentQueueState,
  summarizeOfficeAppointmentChanges
} from '../field-appointment-display';

const baseAppointment: FieldAssignedWorkResponse['jobs'][number]['appointments'][number] = {
  id: 'appointment-1',
  jobId: 'job-1',
  scheduledDate: '2026-05-22',
  scheduledStartTime: '09:00',
  scheduledEndTime: '10:30',
  timeWindowLabel: 'Morning',
  technicianId: 'employee-1',
  technicianName: 'Taylor Tech',
  status: 'scheduled',
  needsOfficeReview: false,
  createdAt: '2026-05-21T12:00:00.000Z',
  updatedAt: '2026-05-21T12:00:00.000Z'
};

const baseLocation: FieldAssignedWorkResponse['locations'][number] = {
  id: 'location-1',
  name: 'North Shop',
  customerId: 'customer-1',
  customerName: 'Acme Supply',
  addressLine1: '123 Main St',
  city: 'Spokane',
  state: 'WA',
  postalCode: '99201',
  isActive: true,
  contacts: [],
  alternateBillToCustomerIds: []
};

function makeSnapshot(
  appointmentOverrides: Partial<FieldAssignedWorkResponse['jobs'][number]['appointments'][number]> = {}
): FieldAssignedWorkResponse {
  const appointment = { ...baseAppointment, ...appointmentOverrides };

  return {
    jobs: [
      {
        id: 'job-1',
        jobNumber: '1001',
        locationId: baseLocation.id,
        locationName: baseLocation.name,
        billToCustomerId: 'customer-1',
        billToCustomerName: 'Acme Supply',
        jobType: 'service',
        category: 'repair',
        origin: 'phone',
        summary: 'No cooling',
        status: 'inProgress',
        workOrderNumber: 'WO-7788',
        needsScheduling: false,
        needsOfficeReview: false,
        appointments: [appointment],
        timeline: [],
        createdAt: '2026-05-21T12:00:00.000Z',
        updatedAt: '2026-05-21T12:00:00.000Z'
      }
    ],
    locations: [baseLocation],
    customers: [],
    equipment: [],
    serverTime: '2026-05-22T12:00:00.000Z',
    snapshotVersion: 'snapshot-1',
    windowStartDate: '2026-05-22',
    windowEndDate: '2026-05-23'
  };
}

describe('field appointment display helpers', () => {
  it('renders a full location address and optional work order line', () => {
    expect(formatFieldLocationAddress(baseLocation)).toBe('123 Main St, Spokane, WA 99201');
    expect(formatFieldLocationAddress(undefined)).toBe('Unknown location address');
    expect(formatWorkOrderLine(makeSnapshot().jobs[0])).toBe('Work order: WO-7788');
    expect(formatWorkOrderLine({ workOrderNumber: undefined })).toBeUndefined();
  });

  it('prefers structured appointment times and falls back to the free-form window', () => {
    expect(formatAppointmentSchedule(baseAppointment)).toBe('2026-05-22 - 09:00-10:30');
    expect(
      formatAppointmentSchedule({
        ...baseAppointment,
        scheduledStartTime: undefined,
        scheduledEndTime: undefined
      })
    ).toBe('2026-05-22 - Morning');
  });

  it('shows office finished-review acknowledgement details', () => {
    expect(
      formatFinishedReviewAcknowledgement({
        ...baseAppointment,
        finishedReviewedAt: '2026-05-22T15:30:00.000Z',
        finishedReviewedBy: 'Dispatcher Dana',
        finishedReviewDecision: 'followUpScheduled'
      })
    ).toBe('Office review acknowledged by Dispatcher Dana: Office scheduled follow-up (2026-05-22)');
    expect(formatFinishedReviewAcknowledgement(baseAppointment)).toBeUndefined();
  });

  it('summarizes pending appointment queue state per appointment', () => {
    const pending: PendingOperation = {
      id: 'op-1',
      kind: 'appointmentStatus',
      appointmentId: 'appointment-1',
      status: 'working',
      occurredAt: '2026-05-22T13:00:00.000Z',
      state: 'pending'
    };

    expect(summarizeAppointmentQueueState('appointment-1', [pending])).toEqual({
      label: 'Appointment change queued on this device.',
      tone: 'attention'
    });
    expect(summarizeAppointmentQueueState('appointment-2', [pending])).toBeUndefined();
  });

  it('treats conflicted or rejected appointment queue entries as needing review', () => {
    const conflict: PendingOperation = {
      id: 'op-1',
      kind: 'appointmentFinishReview',
      appointmentId: 'appointment-1',
      status: 'finished',
      finishOutcome: 'completed',
      hasChargeActivity: true,
      occurredAt: '2026-05-22T13:00:00.000Z',
      state: 'conflict'
    };

    expect(summarizeAppointmentQueueState('appointment-1', [conflict])).toEqual({
      label: 'Appointment change needs review before it can sync.',
      tone: 'alert'
    });
  });

  it('summarizes office changes between assigned-work snapshots', () => {
    const previous = makeSnapshot();
    const next = makeSnapshot({
      scheduledDate: '2026-05-23',
      scheduledStartTime: '11:00',
      scheduledEndTime: '12:00',
      technicianId: undefined,
      technicianName: undefined,
      status: 'confirmed'
    });

    expect(summarizeOfficeAppointmentChanges(previous, next)).toEqual([
      'Job 1001 appointment schedule changed to 2026-05-23 - 11:00-12:00.',
      'Job 1001 appointment assignment changed to Unassigned.',
      'Job 1001 appointment status changed to confirmed.'
    ]);
    expect(summarizeOfficeAppointmentChanges(null, next)).toEqual([]);
  });

  it('reports appointments that disappear from the assigned-work snapshot', () => {
    expect(summarizeOfficeAppointmentChanges(makeSnapshot(), { ...makeSnapshot(), jobs: [] })).toEqual([
      'Job 1001 appointment no longer appears in your assigned work.'
    ]);
  });
});
