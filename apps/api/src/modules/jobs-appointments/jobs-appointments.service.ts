import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AppointmentFinishOutcome,
  AppointmentStatus,
  JobStatus
} from '@bellfield/contracts';
import type { JobRecord } from '../company-data/company-data.types';
import { EquipmentDataService } from '../company-data/equipment-data.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import type { AuthorizedEmployee } from '../identity-access/identity-access.types';
import { getAssignedWorkWindow } from './field-work-window';
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
  UpdateAppointmentScheduleRequestDto,
  UpdateAppointmentStatusRequestDto,
  UpdateJobStatusRequestDto,
  UpdateJobStatusResponseDto
} from './jobs-appointments.types';

const activeJobStatuses: JobStatus[] = ['new', 'scheduled', 'inProgress', 'waitingOnParts'];
const finalJobStatuses: JobStatus[] = ['completed', 'closed', 'cancelled'];

@Injectable()
export class JobsAppointmentsService {
  constructor(
    private readonly referenceDataService: ReferenceDataService,
    private readonly equipmentDataService: EquipmentDataService,
    private readonly jobsDataService: JobsDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  async getWorkspace(sessionToken: string): Promise<JobsWorkspaceResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:view', ['office-web']);

    const [customers, locations, technicians, jobs] = await Promise.all([
      this.referenceDataService.listCustomers(false),
      this.referenceDataService.listLocations(false),
      this.identityAccessService.getActiveEmployees(),
      this.jobsDataService.listJobs()
    ]);

    return {
      customers: customers.map((customer) => ({
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
      })),
      locations: await Promise.all(locations.map((location) => this.toLocationSummary(location.id))),
      technicians: await Promise.all(
        technicians
          .filter((employee) => employee.roleId === 'technician')
          .map((employee) => this.toTechnicianOption(employee.id))
      ),
      jobs: await Promise.all(jobs.map((job) => this.toJobSummaryFromRecord(job)))
    };
  }

  async createJob(sessionToken: string, request: CreateJobRequestDto): Promise<JobSummaryDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'jobs:create', ['office-web']);
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
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, undefined, ['office-web']);
    const jobBeforeUpdate = await this.jobsDataService.getJobById(jobId);
    this.ensureOfficeJobLifecyclePermission(actor, jobBeforeUpdate.status, request.status);
    const referenceDate = (request.occurredAt ?? new Date().toISOString()).slice(0, 10);
    const warningMessages: string[] = [];

    if (request.status === 'completed' && (await this.jobsDataService.hasIncompleteAppointments(jobId))) {
      warningMessages.push('This job still has appointments that are not finished, no-answer, or cancelled.');
    }

    if (request.status === 'closed' && (await this.jobsDataService.hasFutureAppointments(jobId, referenceDate))) {
      warningMessages.push('This job still has a future appointment scheduled. Confirm before closing it out.');
    }

    if (request.status === 'cancelled' && (await this.jobsDataService.hasFutureAppointments(jobId, referenceDate))) {
      warningMessages.push('Cancelling this job will also cancel its future appointments.');
    }

    if (this.isReopenTransition(jobBeforeUpdate.status, request.status)) {
      warningMessages.push('Reopening this job keeps prior appointments and history intact while making the work active again.');
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
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'appointmentsDispatch:create',
      ['office-web']
    );
    const job = await this.jobsDataService.getJobById(jobId);

    if (job.status === 'closed' || job.status === 'cancelled') {
      throw new ConflictException('Appointments cannot be added to closed or cancelled jobs. Reopen the job first if work should continue.');
    }

    await this.jobsDataService.createAppointment(jobId, request, actor.displayName, request.occurredAt);
    return this.toJobSummary(jobId);
  }

  async updateAppointmentSchedule(
    sessionToken: string,
    appointmentId: string,
    request: UpdateAppointmentScheduleRequestDto
  ): Promise<JobSummaryDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'appointmentsDispatch:edit',
      ['office-web']
    );
    const appointment = await this.jobsDataService.getAppointmentById(appointmentId);
    await this.jobsDataService.updateAppointmentSchedule(
      appointmentId,
      request,
      actor.displayName,
      request.occurredAt
    );
    return this.toJobSummary(appointment.jobId);
  }

  async updateAppointmentStatus(
    sessionToken: string,
    appointmentId: string,
    request: UpdateAppointmentStatusRequestDto
  ): Promise<JobMutationResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'appointmentsDispatch:edit');
    const currentAppointment = await this.jobsDataService.getAppointmentById(appointmentId);
    const currentJob = await this.jobsDataService.getJobById(currentAppointment.jobId);
    this.validateAppointmentStatusChange(actor, request);
    const accessCheck = await this.evaluateFieldJobMutationAccess(actor, currentJob.id, {
      occurredAt: request.occurredAt,
      baseUpdatedAt: request.baseUpdatedAt,
      syncSource: request.syncSource
    });

    if (accessCheck.status === 'rejected') {
      return {
        ...(await this.toJobSummary(currentJob.id)),
        syncResult: {
          status: 'rejected',
          message: accessCheck.message
        }
      };
    }

    if (
      request.baseUpdatedAt &&
      currentAppointment.updatedAt > request.baseUpdatedAt &&
      this.hasConflictProneAppointmentChange(request, currentAppointment)
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

    const warningMessages = this.buildFinishWarnings(request);
    const appointment = await this.jobsDataService.updateAppointmentStatus(
      appointmentId,
      request.status,
      actor.displayName,
      request.occurredAt,
      request.status === 'finished'
        ? {
            finishOutcome: request.finishOutcome,
            visitNotes: request.visitNotes,
            hasChargeActivity: request.hasChargeActivity,
            registerFollowUpNote: request.registerFollowUpNote
          }
        : undefined
    );

    if (request.occurredAt) {
      await this.jobsDataService.addSyncFlag(
        appointment.jobId,
        accessCheck.status === 'preservedReplay'
          ? 'Field appointment update synced after assignment changed while the device was offline.'
          : currentJob.status === 'cancelled'
            ? 'Field appointment update synced after the job had already been cancelled.'
            : 'Field update synced after local save queue replay.',
        actor.displayName,
        new Date().toISOString()
      );
    }

    return {
      ...(await this.toJobSummary(appointment.jobId)),
      ...(warningMessages.length > 0 ? { warningMessages } : {}),
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
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken);
    this.ensureJobNotePermission(actor);
    const currentJob = await this.jobsDataService.getJobById(jobId);
    const accessCheck = await this.evaluateFieldJobMutationAccess(actor, jobId, {
      occurredAt: request.occurredAt,
      baseUpdatedAt: request.baseUpdatedAt,
      syncSource: request.syncSource
    });

    if (accessCheck.status === 'rejected') {
      return {
        ...(await this.toJobSummary(jobId)),
        syncResult: {
          status: 'rejected',
          message: accessCheck.message
        }
      };
    }

    await this.jobsDataService.addJobNote(jobId, request.note, actor.displayName, request.occurredAt);

    if (request.occurredAt) {
      await this.jobsDataService.addSyncFlag(
        jobId,
        accessCheck.status === 'preservedReplay'
          ? 'Field note synced after assignment changed while the device was offline.'
          : currentJob.status === 'cancelled'
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
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'appointmentsDispatch:view',
      ['field-mobile']
    );
    const { windowStartDate, windowEndDate, allowedDates } = getAssignedWorkWindow();
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
      equipment: await Promise.all(
        equipment
          .filter((equipmentRecord) => equipmentRecord.locationId && locationIds.includes(equipmentRecord.locationId))
          .map(async (equipmentRecord) => {
            const equipmentGroup = equipmentRecord.systemGroupId
              ? await this.equipmentDataService.getEquipmentGroupById(equipmentRecord.systemGroupId)
              : null;
            const age = deriveEquipmentAge(equipmentRecord.installDate);

            return {
              id: equipmentRecord.id,
              locationId: equipmentRecord.locationId,
              inventoryLocationLabel: equipmentRecord.inventoryLocationLabel,
              equipmentType: equipmentRecord.equipmentType,
              brand: equipmentRecord.brand,
              model: equipmentRecord.model,
              serialNumber: equipmentRecord.serialNumber,
              filterSizes: [...equipmentRecord.filterSizes],
              equipmentLocationDescription: equipmentRecord.equipmentLocationDescription,
              installDate: equipmentRecord.installDate,
              warrantyStartDate: equipmentRecord.warrantyStartDate,
              warrantyEndDate: equipmentRecord.warrantyEndDate,
              warrantyProviderNote: equipmentRecord.warrantyProviderNote,
              status: equipmentRecord.status,
              ageYears: age.ageYears,
              ageLabel: age.ageLabel,
              systemGroup: equipmentGroup ? { id: equipmentGroup.id, name: equipmentGroup.name } : undefined,
              replacesEquipmentId: equipmentRecord.replacesEquipmentId,
              replacedByEquipmentId: equipmentRecord.replacedByEquipmentId,
              notes: equipmentRecord.notes,
              updatedAt: equipmentRecord.updatedAt
            };
          })
      ),
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

  private async toLocationSummary(locationId: string): Promise<LocationSummaryDto> {
    const location = await this.referenceDataService.getLocationDetail(locationId);

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
      contacts: location.contacts.map((contact) => ({
        ...contact,
        tags: [...contact.tags],
        sharedContact: {
          ...contact.sharedContact,
          tags: [...contact.sharedContact.tags]
        }
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

  private async toAppointmentSummary(
    appointmentId: string,
    jobStatus?: JobStatus
  ): Promise<AppointmentSummaryDto> {
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
      finishOutcome: appointment.finishOutcome,
      visitNotes: appointment.visitNotes,
      hasChargeActivity: appointment.hasChargeActivity,
      registerFollowUpNote: appointment.registerFollowUpNote,
      needsOfficeReview: this.needsOfficeReviewForAppointment(appointment.status, jobStatus),
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
    const appointments = await Promise.all(
      job.appointmentIds.map((appointmentId) => this.toAppointmentSummary(appointmentId, job.status))
    );

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
      needsScheduling: !appointments.some(
        (appointment) => appointment.status !== 'cancelled' && Boolean(appointment.scheduledDate)
      ),
      needsOfficeReview: appointments.some((appointment) => appointment.needsOfficeReview),
      appointments,
      timeline: job.timeline.map((entry) => ({ ...entry })),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }

  private ensureOfficeJobLifecyclePermission(
    actor: AuthorizedEmployee,
    currentStatus: JobStatus,
    nextStatus: JobStatus
  ): void {
    const permissions = new Set(actor.effectivePermissions);

    if (this.isReopenTransition(currentStatus, nextStatus)) {
      if (!permissions.has('jobs:configure')) {
        throw new ForbiddenException('Reopening a job requires job configuration permission.');
      }

      return;
    }

    if (!permissions.has('jobs:edit')) {
      throw new ForbiddenException('Changing job status requires job edit permission.');
    }
  }

  private ensureJobNotePermission(actor: AuthorizedEmployee): void {
    const permissions = new Set(actor.effectivePermissions);
    const requiredPermission = actor.sessionSurface === 'field-mobile' ? 'appointmentsDispatch:edit' : 'jobs:edit';

    if (!permissions.has(requiredPermission)) {
      throw new ForbiddenException('You do not have permission to add job notes.');
    }
  }

  private validateAppointmentStatusChange(
    actor: AuthorizedEmployee,
    request: UpdateAppointmentStatusRequestDto
  ): void {
    if (actor.sessionSurface === 'field-mobile' && request.status === 'cancelled') {
      throw new ForbiddenException('Technicians cannot cancel appointments by default.');
    }

    const hasFinishReviewFields =
      request.finishOutcome !== undefined ||
      request.visitNotes !== undefined ||
      request.hasChargeActivity !== undefined ||
      request.registerFollowUpNote !== undefined;

    if (request.status !== 'finished' && hasFinishReviewFields) {
      throw new ConflictException('Finish review details may only be saved when the appointment is marked finished.');
    }

    if (actor.sessionSurface === 'field-mobile' && request.status === 'finished') {
      if (!request.finishOutcome) {
        throw new ConflictException('Field finish review requires a finish outcome.');
      }

      if (request.hasChargeActivity === undefined) {
        throw new ConflictException('Field finish review requires a charge activity answer.');
      }
    }
  }

  private buildFinishWarnings(request: UpdateAppointmentStatusRequestDto): string[] {
    if (request.status !== 'finished') {
      return [];
    }

    const warnings: string[] = [];
    const visitNotes = request.visitNotes?.trim() ?? '';

    if (!visitNotes) {
      warnings.push('Finishing without visit notes is allowed, but BellField should prompt before continuing.');
    }

    if (!visitNotes && request.hasChargeActivity === false) {
      warnings.push('This finish review has no visit notes and no charge activity. Confirm before leaving the visit as finished.');
    }

    return warnings;
  }

  private hasConflictProneAppointmentChange(
    request: UpdateAppointmentStatusRequestDto,
    currentAppointment: {
      status: AppointmentStatus;
      finishOutcome?: AppointmentFinishOutcome;
      visitNotes?: string;
      hasChargeActivity?: boolean;
      registerFollowUpNote?: string;
    }
  ): boolean {
    return (
      request.status !== currentAppointment.status ||
      request.finishOutcome !== currentAppointment.finishOutcome ||
      (request.visitNotes ?? '').trim() !== (currentAppointment.visitNotes ?? '') ||
      request.hasChargeActivity !== currentAppointment.hasChargeActivity ||
      (request.registerFollowUpNote ?? '').trim() !== (currentAppointment.registerFollowUpNote ?? '')
    );
  }

  private needsOfficeReviewForAppointment(
    appointmentStatus: AppointmentStatus,
    jobStatus: JobStatus | undefined
  ): boolean {
    return appointmentStatus === 'finished' && jobStatus !== 'completed' && jobStatus !== 'closed' && jobStatus !== 'cancelled';
  }

  private isReopenTransition(currentStatus: JobStatus, nextStatus: JobStatus): boolean {
    return finalJobStatuses.includes(currentStatus) && activeJobStatuses.includes(nextStatus);
  }

  private async evaluateFieldJobMutationAccess(
    actor: AuthorizedEmployee,
    jobId: string,
    replay: { occurredAt?: string; baseUpdatedAt?: string; syncSource?: string }
  ): Promise<{ status: 'allowed' | 'preservedReplay' | 'rejected'; message?: string }> {
    if (actor.sessionSurface !== 'field-mobile') {
      return { status: 'allowed' };
    }

    const { allowedDates } = getAssignedWorkWindow();
    const assignedJobs = await this.jobsDataService.listAssignedJobsForEmployee(actor.id, allowedDates);
    const assignedJobIds = new Set(assignedJobs.map((job) => job.id));

    if (assignedJobIds.has(jobId)) {
      return { status: 'allowed' };
    }

    if (this.isReplayProvenanceValid(replay)) {
      return { status: 'preservedReplay' };
    }

    return {
      status: 'rejected',
      message: 'This field change is outside the current assigned-work scope and could not be validated as an offline replay.'
    };
  }

  private isReplayProvenanceValid(replay: {
    occurredAt?: string;
    baseUpdatedAt?: string;
    syncSource?: string;
  }): boolean {
    if (replay.syncSource !== 'field-save-queue' || !replay.occurredAt || !replay.baseUpdatedAt) {
      return false;
    }

    return replay.baseUpdatedAt <= replay.occurredAt;
  }
}

function deriveEquipmentAge(installDate?: string): { ageYears?: number; ageLabel?: string } {
  if (!installDate) {
    return {};
  }

  const installedAt = new Date(`${installDate}T00:00:00.000Z`);

  if (Number.isNaN(installedAt.getTime())) {
    return {};
  }

  const now = new Date();
  let ageYears = now.getUTCFullYear() - installedAt.getUTCFullYear();
  const monthOffset = now.getUTCMonth() - installedAt.getUTCMonth();
  const dayOffset = now.getUTCDate() - installedAt.getUTCDate();

  if (monthOffset < 0 || (monthOffset === 0 && dayOffset < 0)) {
    ageYears -= 1;
  }

  if (ageYears < 0) {
    return {};
  }

  return {
    ageYears,
    ageLabel: ageYears === 0 ? 'Less than 1 year' : ageYears === 1 ? '1 year' : `${ageYears} years`
  };
}
