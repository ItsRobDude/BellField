import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AppointmentRecord,
  AppointmentStatus,
  ContactRecord,
  CustomerAccountRecord,
  EquipmentRecord,
  EquipmentStatus,
  JobRecord,
  JobStatus,
  JobTimelineEntry,
  LocationRecord
} from './company-data.types';
import {
  seededAppointments,
  seededContacts,
  seededCustomers,
  seededEquipment,
  seededJobs,
  seededLocations
} from './seed-company-data';

type CreateEquipmentInput = {
  locationId?: string;
  inventoryLocationLabel?: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  status: EquipmentStatus;
  notes?: string;
};

type UpdateEquipmentInput = Partial<CreateEquipmentInput>;

type CreateJobInput = {
  locationId: string;
  billToCustomerId?: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  workOrderNumber?: string;
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
};

type CreateAppointmentInput = {
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
};

@Injectable()
export class CompanyDataService {
  private readonly customers = new Map<string, CustomerAccountRecord>(
    seededCustomers.map((customer) => [customer.id, structuredClone(customer)])
  );

  private readonly contacts = new Map<string, ContactRecord>(
    seededContacts.map((contact) => [contact.id, structuredClone(contact)])
  );

  private readonly locations = new Map<string, LocationRecord>(
    seededLocations.map((location) => [location.id, structuredClone(location)])
  );

  private readonly equipment = new Map<string, EquipmentRecord>(
    seededEquipment.map((equipmentRecord) => [equipmentRecord.id, structuredClone(equipmentRecord)])
  );

  private readonly jobs = new Map<string, JobRecord>(seededJobs.map((job) => [job.id, structuredClone(job)]));

  private readonly appointments = new Map<string, AppointmentRecord>(
    seededAppointments.map((appointment) => [appointment.id, structuredClone(appointment)])
  );

  private jobNumberCounter = 1003;

  listCustomers(): CustomerAccountRecord[] {
    return [...this.customers.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  listContacts(): ContactRecord[] {
    return [...this.contacts.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  listLocations(): LocationRecord[] {
    return [...this.locations.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  getLocationById(locationId: string): LocationRecord {
    const location = this.locations.get(locationId);

    if (!location) {
      throw new NotFoundException('Location not found.');
    }

    return location;
  }

  getCustomerById(customerId: string): CustomerAccountRecord {
    const customer = this.customers.get(customerId);

    if (!customer) {
      throw new NotFoundException('Customer account not found.');
    }

    return customer;
  }

  getContactById(contactId: string): ContactRecord {
    const contact = this.contacts.get(contactId);

    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }

    return contact;
  }

  listEquipment(includeInactive: boolean): EquipmentRecord[] {
    return [...this.equipment.values()]
      .filter((equipmentRecord) => includeInactive || equipmentRecord.status !== 'inactive')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  createEquipment(input: CreateEquipmentInput): EquipmentRecord {
    if (input.locationId) {
      this.getLocationById(input.locationId);
    }

    const now = new Date().toISOString();
    const equipmentRecord: EquipmentRecord = {
      id: randomUUID(),
      locationId: input.locationId,
      inventoryLocationLabel: input.inventoryLocationLabel?.trim() || undefined,
      equipmentType: input.equipmentType.trim(),
      brand: input.brand.trim(),
      model: input.model.trim(),
      serialNumber: input.serialNumber.trim(),
      filterSizes: this.normalizeFilterSizes(input.filterSizes),
      equipmentLocationDescription: input.equipmentLocationDescription?.trim() || undefined,
      installDate: input.installDate?.trim() || undefined,
      status: input.status,
      notes: input.notes?.trim() || '',
      createdAt: now,
      updatedAt: now
    };

    this.equipment.set(equipmentRecord.id, equipmentRecord);
    return equipmentRecord;
  }

  updateEquipment(equipmentId: string, update: UpdateEquipmentInput): EquipmentRecord {
    const existingEquipment = this.getEquipmentById(equipmentId);

    if (update.locationId !== undefined) {
      if (update.locationId) {
        this.getLocationById(update.locationId);
      }

      existingEquipment.locationId = update.locationId || undefined;
    }

    if (update.inventoryLocationLabel !== undefined) {
      existingEquipment.inventoryLocationLabel = update.inventoryLocationLabel?.trim() || undefined;
    }

    if (update.equipmentType !== undefined) {
      existingEquipment.equipmentType = update.equipmentType.trim();
    }

    if (update.brand !== undefined) {
      existingEquipment.brand = update.brand.trim();
    }

    if (update.model !== undefined) {
      existingEquipment.model = update.model.trim();
    }

    if (update.serialNumber !== undefined) {
      existingEquipment.serialNumber = update.serialNumber.trim();
    }

    if (update.filterSizes !== undefined) {
      existingEquipment.filterSizes = this.normalizeFilterSizes(update.filterSizes);
    }

    if (update.equipmentLocationDescription !== undefined) {
      existingEquipment.equipmentLocationDescription = update.equipmentLocationDescription?.trim() || undefined;
    }

    if (update.installDate !== undefined) {
      existingEquipment.installDate = update.installDate?.trim() || undefined;
    }

    if (update.status !== undefined) {
      existingEquipment.status = update.status;
    }

    if (update.notes !== undefined) {
      existingEquipment.notes = update.notes.trim();
    }

    existingEquipment.updatedAt = new Date().toISOString();
    this.equipment.set(existingEquipment.id, existingEquipment);

    return existingEquipment;
  }

  getEquipmentById(equipmentId: string): EquipmentRecord {
    const equipmentRecord = this.equipment.get(equipmentId);

    if (!equipmentRecord) {
      throw new NotFoundException('Equipment record not found.');
    }

    return equipmentRecord;
  }

  listJobs(): JobRecord[] {
    return [...this.jobs.values()].sort((left, right) => left.jobNumber.localeCompare(right.jobNumber));
  }

  getJobById(jobId: string): JobRecord {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    return job;
  }

  listAppointmentsForJob(jobId: string): AppointmentRecord[] {
    return [...this.appointments.values()]
      .filter((appointment) => appointment.jobId === jobId)
      .sort((left, right) =>
        `${left.scheduledDate ?? ''}${left.timeWindowLabel ?? ''}`.localeCompare(
          `${right.scheduledDate ?? ''}${right.timeWindowLabel ?? ''}`
        )
      );
  }

  createJob(input: CreateJobInput, actorName: string): JobRecord {
    const location = this.getLocationById(input.locationId);
    const billToCustomerId = input.billToCustomerId ?? location.customerId;
    this.getCustomerById(billToCustomerId);

    const now = new Date().toISOString();
    const jobId = randomUUID();
    const jobNumber = String(this.jobNumberCounter++);
    const jobRecord: JobRecord = {
      id: jobId,
      jobNumber,
      locationId: location.id,
      billToCustomerId,
      jobType: input.jobType.trim(),
      category: input.category.trim(),
      origin: input.origin.trim(),
      summary: input.summary.trim(),
      status: 'open',
      workOrderNumber: input.workOrderNumber?.trim() || `WO-${jobNumber}`,
      appointmentIds: [],
      timeline: [
        {
          id: randomUUID(),
          occurredAt: now,
          actorName,
          kind: 'jobCreated',
          message: `Job ${jobNumber} created for ${location.name}.`
        }
      ],
      createdAt: now,
      updatedAt: now
    };

    this.jobs.set(jobId, jobRecord);

    if (input.scheduledDate || input.timeWindowLabel || input.technicianId) {
      this.createAppointment(
        jobId,
        {
          scheduledDate: input.scheduledDate,
          timeWindowLabel: input.timeWindowLabel,
          technicianId: input.technicianId
        },
        actorName
      );
    }

    return this.getJobById(jobId);
  }

  updateJobStatus(jobId: string, status: JobStatus, actorName: string, occurredAt?: string): JobRecord {
    const job = this.getJobById(jobId);
    const timelineTime = occurredAt || new Date().toISOString();

    job.status = status;
    job.updatedAt = timelineTime;

    this.addTimelineEntry(job, {
      id: randomUUID(),
      occurredAt: timelineTime,
      actorName,
      kind: 'jobStatusUpdated',
      message: `Job status changed to ${status}.`
    });

    if (status === 'cancelled') {
      for (const appointment of this.listAppointmentsForJob(jobId)) {
        appointment.status = 'cancelled';
        appointment.updatedAt = timelineTime;
        this.appointments.set(appointment.id, appointment);
      }
    }

    this.jobs.set(job.id, job);
    return job;
  }

  createAppointment(jobId: string, input: CreateAppointmentInput, actorName: string, occurredAt?: string): AppointmentRecord {
    const job = this.getJobById(jobId);
    const timelineTime = occurredAt || new Date().toISOString();
    const appointment: AppointmentRecord = {
      id: randomUUID(),
      jobId,
      scheduledDate: input.scheduledDate?.trim() || undefined,
      timeWindowLabel: input.timeWindowLabel?.trim() || undefined,
      technicianId: input.technicianId?.trim() || undefined,
      status: 'assigned',
      createdAt: timelineTime,
      updatedAt: timelineTime
    };

    this.appointments.set(appointment.id, appointment);
    job.appointmentIds.push(appointment.id);
    job.updatedAt = timelineTime;

    this.addTimelineEntry(job, {
      id: randomUUID(),
      occurredAt: timelineTime,
      actorName,
      kind: 'appointmentCreated',
      message: `Appointment added${appointment.scheduledDate ? ` for ${appointment.scheduledDate}` : ''}.`
    });

    this.jobs.set(job.id, job);
    return appointment;
  }

  updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    actorName: string,
    occurredAt?: string
  ): AppointmentRecord {
    const appointment = this.getAppointmentById(appointmentId);
    const timelineTime = occurredAt || new Date().toISOString();
    appointment.status = status;
    appointment.updatedAt = timelineTime;
    this.appointments.set(appointment.id, appointment);

    const job = this.getJobById(appointment.jobId);
    job.updatedAt = timelineTime;

    this.addTimelineEntry(job, {
      id: randomUUID(),
      occurredAt: timelineTime,
      actorName,
      kind: 'appointmentStatusUpdated',
      message: `Appointment status changed to ${status}.`
    });

    this.jobs.set(job.id, job);
    return appointment;
  }

  addJobNote(jobId: string, noteBody: string, actorName: string, occurredAt?: string): JobRecord {
    const job = this.getJobById(jobId);
    const timelineTime = occurredAt || new Date().toISOString();

    this.addTimelineEntry(job, {
      id: randomUUID(),
      occurredAt: timelineTime,
      actorName,
      kind: 'jobNote',
      message: noteBody.trim()
    });

    job.updatedAt = timelineTime;
    this.jobs.set(job.id, job);
    return job;
  }

  addSyncFlag(jobId: string, message: string, actorName: string, occurredAt?: string): JobRecord {
    const job = this.getJobById(jobId);
    const timelineTime = occurredAt || new Date().toISOString();

    this.addTimelineEntry(job, {
      id: randomUUID(),
      occurredAt: timelineTime,
      actorName,
      kind: 'syncFlag',
      message
    });

    job.updatedAt = timelineTime;
    this.jobs.set(job.id, job);
    return job;
  }

  getAppointmentById(appointmentId: string): AppointmentRecord {
    const appointment = this.appointments.get(appointmentId);

    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
    }

    return appointment;
  }

  listAssignedJobsForEmployee(employeeId: string): JobRecord[] {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const allowedDates = new Set([
      today.toISOString().slice(0, 10),
      tomorrow.toISOString().slice(0, 10)
    ]);

    const assignedJobIds = new Set(
      [...this.appointments.values()]
        .filter(
          (appointment) =>
            appointment.technicianId === employeeId &&
            (!appointment.scheduledDate || allowedDates.has(appointment.scheduledDate))
        )
        .map((appointment) => appointment.jobId)
    );

    return this.listJobs().filter((job) => assignedJobIds.has(job.id) && job.status !== 'cancelled');
  }

  private addTimelineEntry(job: JobRecord, entry: JobTimelineEntry): void {
    job.timeline = [...job.timeline, entry].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  private normalizeFilterSizes(filterSizes: string[]): string[] {
    return [...new Set(filterSizes.map((value) => value.trim()).filter(Boolean))];
  }
}
