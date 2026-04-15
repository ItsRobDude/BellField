import { Injectable } from '@nestjs/common';
import type { JobRecord } from '../company-data/company-data.types';
import { EquipmentDataService } from '../company-data/equipment-data.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import type {
  AddJobNoteRequestDto,
  AppointmentSummaryDto,
  CreateAppointmentRequestDto,
  CreateJobRequestDto,
  CustomerAccountSummaryDto,
  FieldAssignedWorkResponseDto,
  JobMutationResponseDto,
  JobSummaryDto,
  JobsWorkspaceResponseDto,
  LocationSummaryDto,
  TechnicianOptionDto,
  UpdateAppointmentStatusRequestDto,
  UpdateJobStatusRequestDto,
  UpdateJobStatusResponseDto
} from './jobs-appointments.types';

@Injectable()
export class JobsAppointmentsService {
  constructor(
    private readonly referenceDataService: ReferenceDataService,
    private readonly equipmentDataService: EquipmentDataService,
    private readonly jobsDataService: JobsDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  async getWorkspace(sessionToken: string): Promise<JobsWorkspaceResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:view');

    const [customers, locations, technicians, jobs] = await Promise.all([
      this.referenceDataService.listCustomers(),
      this.referenceDataService.listLocations(),
      this.identityAccessService.getActiveEmployees(),
      this.jobsDataService.listJobs()
    ]);

    return {
      customers: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        accountType: customer.accountType,
        phone: customer.phone,
        email: customer.email,
        flags: [...customer.flags]
      })),
      locations: await Promise.all(locations.map((location) => this.toLocationSummary(location.id))),
      technicians: await Promise.all(
        technicians
          .filter((employee) => employee.roleId === 'technician')
          .map((employee) => this.toTechnicianOption(employee.id))
      ),
      jobs: await Promise.all(jobs.map((job) => this.toJobSummary(job.id)))
    };
  }

  async createJob(sessionToken: string, request: CreateJobRequestDto): Promise<JobSummaryDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:create');
    const location = await this.referenceDataService.getLocationById(request.locationId);
    const billToCustomerId = request.billToCustomerId ?? location.customerId;
    await this.referenceDataService.getCustomerById(billToCustomerId);
    const job = await this.jobsDataService.createJob(request, actor.displayName, billToCustomerId, location.name);
    return this.toJobSummary(job.id);
  }

  async updateJobStatus(
    sessionToken: string,
    jobId: string,
    request: UpdateJobStatusRequestDto
  ): Promise<UpdateJobStatusResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:edit');
    await this.jobsDataService.getJobById(jobId);
    const referenceDate = (request.occurredAt ?? new Date().toISOString()).slice(0, 10);
    const warningMessages: string[] = [];

    if (request.status === 'closed' && (await this.jobsDataService.hasFutureAppointments(jobId, referenceDate))) {
      warningMessages.push('This job still has a future appointment scheduled. Confirm before closing it out.');
    }

    const job = await this.jobsDataService.updateJobStatus(jobId, request.status, actor.displayName, request.occurredAt);

    return {
      ...(await this.toJobSummary(job.id)),
      ...(warningMessages.length > 0 ? { warningMessages } : {})
    };
  }

  async addAppointment(
    sessionToken: string,
    jobId: string,
    request: CreateAppointmentRequestDto
  ): Promise<JobSummaryDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'appointmentsDispatch:create');
    await this.jobsDataService.getJobById(jobId);
    await this.jobsDataService.createAppointment(jobId, request, actor.displayName, request.occurredAt);
    return this.toJobSummary(jobId);
  }

  async updateAppointmentStatus(
    sessionToken: string,
    appointmentId: string,
    request: UpdateAppointmentStatusRequestDto
  ): Promise<JobMutationResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'appointmentsDispatch:edit');
    const currentAppointment = await this.jobsDataService.getAppointmentById(appointmentId);
    const currentJob = await this.jobsDataService.getJobById(currentAppointment.jobId);

    if (
      request.baseUpdatedAt &&
      currentAppointment.updatedAt > request.baseUpdatedAt &&
      currentAppointment.status !== request.status
    ) {
      await this.jobsDataService.addSyncFlag(
        currentAppointment.jobId,
        'Field appointment update conflicted with a newer BellField appointment change.',
        actor.displayName,
        new Date().toISOString()
      );

      return {
        ...(await this.toJobSummary(currentAppointment.jobId)),
        syncResult: {
          status: 'conflict',
          message: 'Appointment changed before this offline update could sync.'
        }
      };
    }

    const appointment = await this.jobsDataService.updateAppointmentStatus(
      appointmentId,
      request.status,
      actor.displayName,
      request.occurredAt
    );

    if (request.occurredAt) {
      await this.jobsDataService.addSyncFlag(
        appointment.jobId,
        currentJob.status === 'cancelled'
          ? 'Field appointment update synced after the job had already been cancelled.'
          : 'Field update synced after local save queue replay.',
        actor.displayName,
        new Date().toISOString()
      );
    }

    return {
      ...(await this.toJobSummary(appointment.jobId)),
      ...(request.baseUpdatedAt
        ? {
            syncResult: {
              status: 'applied'
            }
          }
        : {})
    };
  }

  async addJobNote(sessionToken: string, jobId: string, request: AddJobNoteRequestDto): Promise<JobMutationResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:edit');
    const currentJob = await this.jobsDataService.getJobById(jobId);

    await this.jobsDataService.addJobNote(jobId, request.note, actor.displayName, request.occurredAt);

    if (request.occurredAt) {
      await this.jobsDataService.addSyncFlag(
        jobId,
        currentJob.status === 'cancelled'
          ? 'Field note synced after the job had already been cancelled.'
          : 'Field note synced after local save queue replay.',
        actor.displayName,
        new Date().toISOString()
      );
    }

    return {
      ...(await this.toJobSummary(jobId)),
      ...(request.occurredAt
        ? {
            syncResult: {
              status: 'applied'
            }
          }
        : {})
    };
  }

  async getAssignedWork(sessionToken: string): Promise<FieldAssignedWorkResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:view');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    // Use the server's local calendar day so the default today/tomorrow window
    // does not shift forward during late-evening hours due to UTC conversion.
    const windowStartDate = formatLocalDate(today);
    const windowEndDate = formatLocalDate(tomorrow);
    const allowedDates = new Set([windowStartDate, windowEndDate]);
    const jobs = await this.jobsDataService.listAssignedJobsForEmployee(actor.id, allowedDates);
    const locationIds = [...new Set(jobs.map((job) => job.locationId))];
    const equipment = await this.equipmentDataService.listEquipment(true);
    const serverTime = new Date().toISOString();

    return {
      jobs: await Promise.all(jobs.map((job) => this.toJobSummary(job.id))),
      locations: await Promise.all(locationIds.map((locationId) => this.toLocationSummary(locationId))),
      customers: await Promise.all(
        [
          ...new Set(
            await Promise.all(locationIds.map(async (locationId) => (await this.referenceDataService.getLocationById(locationId)).customerId))
          )
        ].map((customerId) => this.toCustomerSummary(customerId))
      ),
      equipment: equipment
        .filter((equipmentRecord) => equipmentRecord.locationId && locationIds.includes(equipmentRecord.locationId))
        .map((equipmentRecord) => ({
          id: equipmentRecord.id,
          locationId: equipmentRecord.locationId,
          equipmentType: equipmentRecord.equipmentType,
          brand: equipmentRecord.brand,
          model: equipmentRecord.model,
          serialNumber: equipmentRecord.serialNumber,
          filterSizes: [...equipmentRecord.filterSizes],
          equipmentLocationDescription: equipmentRecord.equipmentLocationDescription,
          installDate: equipmentRecord.installDate,
          status: equipmentRecord.status,
          notes: equipmentRecord.notes,
          updatedAt: equipmentRecord.updatedAt
        })),
      serverTime,
      snapshotVersion: serverTime,
      windowStartDate,
      windowEndDate
    };
  }

  private async toCustomerSummary(customerId: string): Promise<CustomerAccountSummaryDto> {
    const customer = await this.referenceDataService.getCustomerById(customerId);

    return {
      id: customer.id,
      name: customer.name,
      accountType: customer.accountType,
      phone: customer.phone,
      email: customer.email,
      flags: [...customer.flags]
    };
  }

  private async toLocationSummary(locationId: string): Promise<LocationSummaryDto> {
    const location = await this.referenceDataService.getLocationById(locationId);
    const customer = await this.referenceDataService.getCustomerById(location.customerId);
    const contacts = await Promise.all(location.contactIds.map((contactId) => this.referenceDataService.getContactById(contactId)));

    return {
      id: location.id,
      name: location.name,
      customerId: customer.id,
      customerName: customer.name,
      addressLine1: location.addressLine1,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      contacts: contacts.map((contact) => ({
        id: contact.id,
        displayName: contact.displayName,
        phone: contact.phone,
        email: contact.email,
        tags: [...contact.tags]
      })),
      alternateBillToCustomerIds: [...location.alternateBillToCustomerIds]
    };
  }

  private async toTechnicianOption(employeeId: string): Promise<TechnicianOptionDto> {
    const employee = await this.identityAccessService.getEmployeeSummaryById(employeeId);

    return {
      id: employee?.id ?? employeeId,
      displayName: employee?.displayName ?? 'Unknown technician',
      roleId: employee?.roleId ?? 'technician'
    };
  }

  private async toAppointmentSummary(appointmentId: string): Promise<AppointmentSummaryDto> {
    const appointment = await this.jobsDataService.getAppointmentById(appointmentId);
    const technician = appointment.technicianId
      ? await this.identityAccessService.getEmployeeSummaryById(appointment.technicianId)
      : null;

    return {
      id: appointment.id,
      jobId: appointment.jobId,
      scheduledDate: appointment.scheduledDate,
      timeWindowLabel: appointment.timeWindowLabel,
      technicianId: appointment.technicianId,
      technicianName: technician?.displayName,
      status: appointment.status,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt
    };
  }

  private async toJobSummary(jobId: string): Promise<JobSummaryDto> {
    const job = await this.jobsDataService.getJobById(jobId);
    return this.toJobSummaryFromRecord(job);
  }

  private async toJobSummaryFromRecord(job: JobRecord): Promise<JobSummaryDto> {
    const location = await this.referenceDataService.getLocationById(job.locationId);
    const billToCustomer = await this.referenceDataService.getCustomerById(job.billToCustomerId);

    return {
      id: job.id,
      jobNumber: job.jobNumber,
      locationId: location.id,
      locationName: location.name,
      billToCustomerId: billToCustomer.id,
      billToCustomerName: billToCustomer.name,
      jobType: job.jobType,
      category: job.category,
      origin: job.origin,
      summary: job.summary,
      status: job.status,
      workOrderNumber: job.workOrderNumber,
      appointments: await Promise.all(job.appointmentIds.map((appointmentId) => this.toAppointmentSummary(appointmentId))),
      timeline: job.timeline.map((entry) => ({ ...entry })),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }
}

function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
