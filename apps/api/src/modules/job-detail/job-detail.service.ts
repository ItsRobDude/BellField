import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AppointmentStatus,
  CustomerAccountSummary,
  EquipmentSummary,
  JobStatus,
  LocationSummary,
  MediaAttachmentSummary,
  RegisterEntrySummary
} from '@bellfield/contracts';
import type {
  AppointmentRecord,
  EquipmentRecord,
  JobRecord,
  MediaAttachmentRecord,
  RegisterEntryRecord
} from '../company-data/company-data.types';
import { EquipmentDataService } from '../company-data/equipment-data.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import type { EmployeeSummary } from '../identity-access/identity-access.types';
import type { JobDetailResponseDto } from './job-detail.types';

const defaultTimelineLimit = 50;
const maxTimelineLimit = 200;

@Injectable()
export class JobDetailService {
  constructor(
    private readonly referenceDataService: ReferenceDataService,
    private readonly equipmentDataService: EquipmentDataService,
    private readonly jobsDataService: JobsDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  async getJobDetail(
    sessionToken: string,
    jobId: string,
    timelineLimitQuery?: string
  ): Promise<JobDetailResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'jobs:view',
      ['office-web']
    );
    const timelineLimit = this.parseTimelineLimit(timelineLimitQuery);
    const detail = await this.jobsDataService.getJobDetailById(jobId, timelineLimit);
    const job = detail.job;
    const [location, billToCustomer, technicians, equipment, registerEntries, mediaAttachments] =
      await Promise.all([
        this.referenceDataService.getLocationDetail(job.locationId),
        this.referenceDataService.getCustomerById(job.billToCustomerId),
        this.identityAccessService.getActiveEmployees(),
        this.equipmentDataService.listEquipmentByLocation(job.locationId, false),
        actor.effectivePermissions.includes('register:view')
          ? this.jobsDataService.listRegisterEntriesForJob(job.id, true)
          : Promise.resolve([]),
        actor.effectivePermissions.includes('media:view')
          ? this.jobsDataService.listMediaAttachmentsForJob(job.id, true)
          : Promise.resolve([])
      ]);
    const technicianOptions = technicians
      .filter((employee) => employee.roleId === 'technician')
      .map((employee) => ({
        id: employee.id,
        displayName: employee.displayName,
        roleId: employee.roleId
      }));
    const employeeById = new Map(technicians.map((employee) => [employee.id, employee]));
    const missingTechnicianIds = [
      ...new Set(
        detail.appointments
          .map((appointment) => appointment.technicianId)
          .filter((technicianId): technicianId is string => Boolean(technicianId))
      )
    ].filter((technicianId) => !employeeById.has(technicianId));
    const missingTechnicians = await Promise.all(
      missingTechnicianIds.map((technicianId) =>
        this.identityAccessService.getEmployeeSummaryById(technicianId)
      )
    );

    for (const technician of missingTechnicians) {
      if (technician) {
        employeeById.set(technician.id, technician);
      }
    }

    return {
      job: this.toJobSummary(
        job,
        detail.appointments,
        registerEntries,
        employeeById,
        location.name,
        billToCustomer.name
      ),
      location: this.toLocationSummary(location),
      billToCustomer: this.toCustomerSummary(billToCustomer),
      technicians: technicianOptions,
      equipment: equipment.map((record) =>
        this.toEquipmentSummary(record, location.name, location.customerName)
      ),
      registerEntries: registerEntries.map((entry) => this.toRegisterEntrySummary(entry)),
      mediaAttachments: mediaAttachments.map((attachment) =>
        this.toMediaAttachmentSummary(attachment)
      ),
      timelineLimit: detail.timelineLimit,
      timelineHasMore: detail.timelineHasMore
    };
  }

  private parseTimelineLimit(value: string | undefined): number {
    if (!value) {
      return defaultTimelineLimit;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('timelineLimit must be a positive integer.');
    }

    if (parsed > maxTimelineLimit) {
      throw new BadRequestException(`timelineLimit cannot exceed ${maxTimelineLimit}.`);
    }

    return parsed;
  }

  private toJobSummary(
    job: JobRecord,
    appointments: AppointmentRecord[],
    registerEntries: RegisterEntryRecord[],
    employeeById: Map<string, EmployeeSummary>,
    locationName: string,
    billToCustomerName: string
  ): JobDetailResponseDto['job'] {
    const appointmentSummaries = appointments.map((appointment) =>
      this.toAppointmentSummary(
        appointment,
        job.status,
        employeeById.get(appointment.technicianId ?? '')
      )
    );

    return {
      id: job.id,
      jobNumber: job.jobNumber,
      locationId: job.locationId,
      locationName,
      billToCustomerId: job.billToCustomerId,
      billToCustomerName,
      jobType: job.jobType,
      category: job.category,
      origin: job.origin,
      summary: job.summary,
      status: job.status,
      workOrderNumber: job.workOrderNumber,
      needsScheduling: !appointmentSummaries.some(
        (appointment) => appointment.status !== 'cancelled' && Boolean(appointment.scheduledDate)
      ),
      needsOfficeReview: appointmentSummaries.some((appointment) => appointment.needsOfficeReview),
      appointments: appointmentSummaries,
      registerEntries: registerEntries.map((entry) => this.toRegisterEntrySummary(entry)),
      timeline: job.timeline.map((entry) => ({ ...entry })),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }

  private toAppointmentSummary(
    appointment: AppointmentRecord,
    jobStatus: JobStatus,
    technician: EmployeeSummary | undefined
  ): JobDetailResponseDto['job']['appointments'][number] {
    return {
      id: appointment.id,
      jobId: appointment.jobId,
      scheduledDate: appointment.scheduledDate,
      scheduledStartTime: appointment.scheduledStartTime,
      scheduledEndTime: appointment.scheduledEndTime,
      timeWindowLabel: appointment.timeWindowLabel,
      technicianId: appointment.technicianId,
      technicianName: technician?.displayName,
      status: appointment.status,
      finishOutcome: appointment.finishOutcome,
      visitNotes: appointment.visitNotes,
      hasChargeActivity: appointment.hasChargeActivity,
      registerFollowUpNote: appointment.registerFollowUpNote,
      finishedReviewedAt: appointment.finishedReviewedAt,
      finishedReviewedBy: appointment.finishedReviewedBy,
      finishedReviewDecision: appointment.finishedReviewDecision,
      needsOfficeReview: this.needsOfficeReviewForAppointment(
        appointment.status,
        jobStatus,
        appointment.finishedReviewedAt
      ),
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt
    };
  }

  private toLocationSummary(location: LocationSummary): LocationSummary {
    return {
      id: location.id,
      name: location.name,
      customerId: location.customerId,
      customerName: location.customerName,
      addressLine1: location.addressLine1,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      phone: location.phone,
      email: location.email,
      fax: location.fax,
      isActive: location.isActive,
      contacts: [...location.contacts],
      alternateBillToCustomerIds: [...location.alternateBillToCustomerIds]
    };
  }

  private toCustomerSummary(customer: CustomerAccountSummary): CustomerAccountSummary {
    return {
      id: customer.id,
      name: customer.name,
      accountType: customer.accountType,
      billingAddressLine1: customer.billingAddressLine1,
      billingCity: customer.billingCity,
      billingState: customer.billingState,
      billingPostalCode: customer.billingPostalCode,
      phone: customer.phone,
      email: customer.email,
      fax: customer.fax,
      isActive: customer.isActive,
      flags: [...customer.flags]
    };
  }

  private toEquipmentSummary(
    equipment: EquipmentRecord,
    locationName: string,
    customerName: string
  ): EquipmentSummary {
    return {
      id: equipment.id,
      locationId: equipment.locationId,
      locationName,
      customerName,
      inventoryLocationLabel: equipment.inventoryLocationLabel,
      equipmentType: equipment.equipmentType,
      brand: equipment.brand,
      model: equipment.model,
      serialNumber: equipment.serialNumber,
      filterSizes: [...equipment.filterSizes],
      equipmentLocationDescription: equipment.equipmentLocationDescription,
      installDate: equipment.installDate,
      warrantyStartDate: equipment.warrantyStartDate,
      warrantyEndDate: equipment.warrantyEndDate,
      warrantyProviderNote: equipment.warrantyProviderNote,
      status: equipment.status,
      replacesEquipmentId: equipment.replacesEquipmentId,
      replacedByEquipmentId: equipment.replacedByEquipmentId,
      notes: equipment.notes,
      updatedAt: equipment.updatedAt
    };
  }

  private toRegisterEntrySummary(entry: RegisterEntryRecord): RegisterEntrySummary {
    return { ...entry };
  }

  private toMediaAttachmentSummary(attachment: MediaAttachmentRecord): MediaAttachmentSummary {
    return {
      id: attachment.id,
      jobId: attachment.jobId,
      appointmentId: attachment.appointmentId,
      kind: attachment.kind,
      contentType: attachment.contentType,
      byteSize: attachment.byteSize,
      sha256: attachment.sha256,
      originalFilename: attachment.originalFilename,
      caption: attachment.caption,
      capturedByEmployeeId: attachment.capturedByEmployeeId,
      capturedByName: attachment.capturedByName,
      capturedAt: attachment.capturedAt,
      uploadCompleted: Boolean(attachment.uploadedAt && attachment.storagePath),
      uploadedAt: attachment.uploadedAt,
      isVoid: attachment.isVoid,
      voidReason: attachment.voidReason,
      createdAt: attachment.createdAt,
      updatedAt: attachment.updatedAt
    };
  }

  private needsOfficeReviewForAppointment(
    appointmentStatus: AppointmentStatus,
    jobStatus: JobStatus,
    finishedReviewedAt: string | undefined
  ): boolean {
    return (
      appointmentStatus === 'finished' &&
      !finishedReviewedAt &&
      jobStatus !== 'completed' &&
      jobStatus !== 'closed' &&
      jobStatus !== 'cancelled'
    );
  }
}
