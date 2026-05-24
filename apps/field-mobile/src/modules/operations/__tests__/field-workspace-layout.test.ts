import { describe, expect, it } from 'vitest';
import type { AppointmentSummary, EquipmentSummary, JobSummary } from '@bellfield/contracts';
import type { PendingOperation } from '../field-sync-types';
import {
  buildFieldMediaCaptionDraftKey,
  buildReplacementEquipmentOptions,
  countJobRegisterEntries,
  fieldDetailTabs,
  getPendingOperationsForJob,
  resolveSelectedFieldJob,
  shouldReturnToFieldHome,
  summarizeJobQueueBadge
} from '../field-workspace-layout';

const baseTimestamp = '2026-05-23T10:00:00.000Z';

function buildAppointment(overrides: Partial<AppointmentSummary> = {}): AppointmentSummary {
  return {
    id: 'appointment-1',
    jobId: 'job-1',
    status: 'scheduled',
    needsOfficeReview: false,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildJob(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: 'job-1',
    jobNumber: '1001',
    locationId: 'location-1',
    locationName: 'Main Shop',
    billToCustomerId: 'customer-1',
    billToCustomerName: 'Acme',
    jobType: 'Service',
    category: 'General',
    origin: 'Inbound phone call',
    summary: 'No cooling',
    status: 'scheduled',
    needsScheduling: false,
    needsOfficeReview: false,
    appointments: [buildAppointment()],
    registerEntries: [],
    timeline: [],
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildEquipment(overrides: Partial<EquipmentSummary> = {}): EquipmentSummary {
  return {
    id: 'equipment-1',
    locationId: 'location-1',
    equipmentType: 'Condenser',
    brand: 'Carrier',
    model: '24ABC',
    serialNumber: 'SER-1',
    filterSizes: [],
    status: 'active',
    notes: '',
    updatedAt: baseTimestamp,
    ...overrides
  };
}

describe('field workspace layout helpers', () => {
  it('keeps job-level and appointment-level media caption drafts separate', () => {
    expect(buildFieldMediaCaptionDraftKey({ jobId: 'job-1' })).toBe('job:job-1');
    expect(buildFieldMediaCaptionDraftKey({ jobId: 'job-1', appointmentId: 'appointment-1' })).toBe(
      'appointment:appointment-1'
    );
  });

  it('resolves selected jobs and signals when detail should return home', () => {
    const jobs = [buildJob(), buildJob({ id: 'job-2', jobNumber: '1002' })];

    expect(resolveSelectedFieldJob(jobs, null)).toBeNull();
    expect(resolveSelectedFieldJob(jobs, 'job-2')?.jobNumber).toBe('1002');
    expect(shouldReturnToFieldHome(jobs, 'job-missing')).toBe(true);
    expect(shouldReturnToFieldHome(jobs, 'job-1')).toBe(false);
  });

  it('keeps the compact field detail tabs in the locked order', () => {
    expect(fieldDetailTabs.map((tab) => tab.id)).toEqual([
      'overview',
      'appointments',
      'register',
      'equipment',
      'sync'
    ]);
  });

  it('builds queue badges from job, appointment, equipment, register, and media operations', () => {
    const job = buildJob();
    const equipment = [buildEquipment()];
    const pendingOperations: PendingOperation[] = [
      {
        id: 'op-note',
        kind: 'jobNote',
        jobId: 'job-1',
        note: 'Filter cleaned.',
        occurredAt: baseTimestamp,
        state: 'pending'
      },
      {
        id: 'op-status',
        kind: 'appointmentStatus',
        appointmentId: 'appointment-1',
        status: 'working',
        occurredAt: baseTimestamp,
        state: 'pending'
      },
      {
        id: 'op-equipment',
        kind: 'equipmentUpdate',
        equipmentId: 'equipment-1',
        status: 'active',
        notes: 'Serial verified.',
        occurredAt: baseTimestamp,
        state: 'pending'
      },
      {
        id: 'op-media-upload',
        kind: 'mediaUpload',
        jobId: 'job-1',
        localMediaId: 'media-1',
        localUri: 'file:///media-1.jpg',
        originalFilename: 'media-1.jpg',
        mediaKind: 'image',
        contentType: 'image/jpeg',
        byteSize: 5,
        sha256: 'a'.repeat(64),
        capturedAt: baseTimestamp,
        occurredAt: baseTimestamp,
        state: 'conflict',
        lastResultMessage: 'Server rejected duplicate metadata.'
      }
    ];

    expect(getPendingOperationsForJob(job, equipment, pendingOperations)).toHaveLength(4);
    expect(summarizeJobQueueBadge(job, equipment, pendingOperations)).toEqual({
      count: 1,
      label: '1 needs review',
      tone: 'alert'
    });
  });

  it('counts only active register entries for the home badge', () => {
    const job = buildJob({
      registerEntries: [
        {
          id: 'register-1',
          jobId: 'job-1',
          kind: 'part',
          description: 'Contactor',
          quantity: 1,
          totalAmount: 125,
          capturedByEmployeeId: 'employee-1',
          capturedByName: 'Taylor Tech',
          capturedAt: baseTimestamp,
          isVoid: false,
          createdAt: baseTimestamp,
          updatedAt: baseTimestamp
        },
        {
          id: 'register-2',
          jobId: 'job-1',
          kind: 'labor',
          description: 'Duplicate labor',
          quantity: 1,
          totalAmount: 95,
          capturedByEmployeeId: 'employee-1',
          capturedByName: 'Taylor Tech',
          capturedAt: baseTimestamp,
          isVoid: true,
          createdAt: baseTimestamp,
          updatedAt: baseTimestamp
        }
      ]
    });

    expect(countJobRegisterEntries(job)).toBe(1);
  });

  it('builds replacement equipment choices without exposing raw IDs as labels', () => {
    const sourceEquipment = buildEquipment({
      id: 'equipment-old',
      equipmentType: 'Furnace',
      locationId: 'location-1',
      model: 'OldModel',
      serialNumber: 'OLD-1'
    });
    const options = buildReplacementEquipmentOptions(sourceEquipment, [
      sourceEquipment,
      buildEquipment({
        id: 'equipment-new',
        brand: 'Trane',
        equipmentLocationDescription: 'Attic platform',
        equipmentType: 'Furnace',
        locationId: 'location-1',
        model: 'S9X1',
        serialNumber: 'NEW-1'
      }),
      buildEquipment({
        id: 'equipment-other-location',
        locationId: 'location-2',
        model: 'OtherLocation'
      })
    ]);

    expect(options).toEqual([
      {
        detail: 'Serial: NEW-1 - Location: Attic platform',
        id: 'equipment-new',
        label: 'Furnace: Trane S9X1'
      }
    ]);
    expect(options[0]?.label).not.toContain('equipment-new');
  });
});
