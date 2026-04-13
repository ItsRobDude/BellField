import { Injectable } from '@nestjs/common';
import { CompanyDataService } from '../company-data/company-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import type {
  AddJobNoteRequestDto,
  AppointmentSummaryDto,
  CreateAppointmentRequestDto,
  CreateJobRequestDto,
  CustomerAccountSummaryDto,
  FieldAssignedWorkResponseDto,
  JobSummaryDto,
  JobsWorkspaceResponseDto,
  LocationSummaryDto,
  TechnicianOptionDto,
  UpdateAppointmentStatusRequestDto,
  UpdateJobStatusRequestDto
} from './jobs-appointments.types';

@Injectable()
export class JobsAppointmentsService {
  constructor(
    private readonly companyDataService: CompanyDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  getWorkspace(sessionToken: string): JobsWorkspaceResponseDto {
    this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:view');

    return {
      customers: this.companyDataService.listCustomers().map((customer) => this.toCustomerSummary(customer.id)),
      locations: this.companyDataService.listLocations().map((location) => this.toLocationSummary(location.id)),
      technicians: this.identityAccessService
        .getActiveEmployees()
        .filter((employee) => employee.roleId === 'technician')
        .map((employee) => this.toTechnicianOption(employee.id)),
      jobs: this.companyDataService.listJobs().map((job) => this.toJobSummary(job.id))
    };
  }

  createJob(sessionToken: string, request: CreateJobRequestDto): JobSummaryDto {
    const actor = this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:create');
    const job = this.companyDataService.createJob(request, actor.displayName);
    return this.toJobSummary(job.id);
  }

  updateJobStatus(sessionToken: string, jobId: string, request: UpdateJobStatusRequestDto): JobSummaryDto {
    const actor = this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:edit');
    const job = this.companyDataService.updateJobStatus(jobId, request.status, actor.displayName, request.occurredAt);
    return this.toJobSummary(job.id);
  }

  addAppointment(sessionToken: string, jobId: string, request: CreateAppointmentRequestDto): JobSummaryDto {
    const actor = this.identityAccessService.getAuthorizedEmployee(sessionToken, 'appointmentsDispatch:create');
    this.companyDataService.createAppointment(jobId, request, actor.displayName, request.occurredAt);
    return this.toJobSummary(jobId);
  }

  updateAppointmentStatus(
    sessionToken: string,
    appointmentId: string,
    request: UpdateAppointmentStatusRequestDto
  ): JobSummaryDto {
    const actor = this.identityAccessService.getAuthorizedEmployee(sessionToken, 'appointmentsDispatch:edit');
    const appointment = this.companyDataService.updateAppointmentStatus(
      appointmentId,
      request.status,
      actor.displayName,
      request.occurredAt
    );

    if (request.occurredAt) {
      this.companyDataService.addSyncFlag(
        appointment.jobId,
        'Field update synced after local save queue replay.',
        actor.displayName,
        new Date().toISOString()
      );
    }

    return this.toJobSummary(appointment.jobId);
  }

  addJobNote(sessionToken: string, jobId: string, request: AddJobNoteRequestDto): JobSummaryDto {
    const actor = this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:edit');
    this.companyDataService.addJobNote(jobId, request.note, actor.displayName, request.occurredAt);

    if (request.occurredAt) {
      this.companyDataService.addSyncFlag(
        jobId,
        'Field note synced after local save queue replay.',
        actor.displayName,
        new Date().toISOString()
      );
    }

    return this.toJobSummary(jobId);
  }

  getAssignedWork(sessionToken: string): FieldAssignedWorkResponseDto {
    const actor = this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:view');
    const jobs = this.companyDataService.listAssignedJobsForEmployee(actor.id);
    const locationIds = [...new Set(jobs.map((job) => job.locationId))];

    return {
      jobs: jobs.map((job) => this.toJobSummary(job.id)),
      locations: locationIds.map((locationId) => this.toLocationSummary(locationId)),
      customers: locationIds
        .map((locationId) => this.companyDataService.getLocationById(locationId).customerId)
        .filter((customerId, index, values) => values.indexOf(customerId) === index)
        .map((customerId) => this.toCustomerSummary(customerId)),
      equipment: this.companyDataService
        .listEquipment(true)
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
      serverTime: new Date().toISOString()
    };
  }

  private toCustomerSummary(customerId: string): CustomerAccountSummaryDto {
    const customer = this.companyDataService.getCustomerById(customerId);

    return {
      id: customer.id,
      name: customer.name,
      accountType: customer.accountType,
      phone: customer.phone,
      email: customer.email,
      flags: [...customer.flags]
    };
  }

  private toLocationSummary(locationId: string): LocationSummaryDto {
    const location = this.companyDataService.getLocationById(locationId);
    const customer = this.companyDataService.getCustomerById(location.customerId);

    return {
      id: location.id,
      name: location.name,
      customerId: customer.id,
      customerName: customer.name,
      addressLine1: location.addressLine1,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      contacts: location.contactIds.map((contactId) => {
        const contact = this.companyDataService.getContactById(contactId);

        return {
          id: contact.id,
          displayName: contact.displayName,
          phone: contact.phone,
          email: contact.email,
          tags: [...contact.tags]
        };
      }),
      alternateBillToCustomerIds: [...location.alternateBillToCustomerIds]
    };
  }

  private toTechnicianOption(employeeId: string): TechnicianOptionDto {
    const employee = this.identityAccessService.getEmployeeSummaryById(employeeId);

    return {
      id: employee?.id ?? employeeId,
      displayName: employee?.displayName ?? 'Unknown technician',
      roleId: employee?.roleId ?? 'technician'
    };
  }

  private toAppointmentSummary(appointmentId: string): AppointmentSummaryDto {
    const appointment = this.companyDataService.getAppointmentById(appointmentId);
    const technician = appointment.technicianId
      ? this.identityAccessService.getEmployeeSummaryById(appointment.technicianId)
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

  private toJobSummary(jobId: string): JobSummaryDto {
    const job = this.companyDataService.getJobById(jobId);
    const location = this.companyDataService.getLocationById(job.locationId);
    const billToCustomer = this.companyDataService.getCustomerById(job.billToCustomerId);

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
      appointments: this.companyDataService
        .listAppointmentsForJob(job.id)
        .map((appointment) => this.toAppointmentSummary(appointment.id)),
      timeline: job.timeline.map((entry) => ({ ...entry })),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }
}
