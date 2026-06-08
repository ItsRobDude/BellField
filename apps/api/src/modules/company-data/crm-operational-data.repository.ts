import { Injectable } from '@nestjs/common';
import type {
  CrmOperationalAppointmentSummary,
  CrmOperationalContext,
  CrmOperationalEquipmentSummary,
  CrmOperationalEstimateSummary,
  CrmOperationalInvoiceSummary,
  CrmOperationalJobSummary,
  CrmOperationalSummary
} from '@bellfield/contracts';
import {
  toIsoString,
  toOptionalDateString,
  toOptionalTimeString
} from '../../database/database-row.utils';
import { DatabaseService } from '../../database/database.service';
import type { AppointmentStatus, EquipmentStatus, JobStatus } from './company-data.types';
import { listCrmActivityForCustomer, listCrmActivityForLocation } from './crm-activity.repository';
import {
  getCrmAgreementCountsForCustomer,
  getCrmAgreementCountsForLocation,
  listCrmAgreementsForCustomer,
  listCrmAgreementsForLocation
} from './crm-agreements-context.repository';

const crmJobLimit = 25;
const crmAppointmentLimit = 50;
const crmInvoiceLimit = 25;
const crmEstimateLimit = 25;
const crmEquipmentLimit = 25;
const crmActivityLimit = 60;
const activeJobSqlList = "'new', 'scheduled', 'inProgress', 'waitingOnParts'";

type CrmOperationalOptions = {
  includeAgreementContext?: boolean;
};

type SummaryRow = {
  openJobCount: string | number;
  lastServiceAt: string | Date | null;
  equipmentCount: string | number;
  appointmentCount: string | number;
  invoiceCount: string | number;
  estimateCount: string | number;
};

type AppointmentRow = {
  id: string;
  jobId: string;
  jobNumber: string;
  scheduledDate: string | Date | null;
  scheduledStartTime: string | Date | null;
  scheduledEndTime: string | Date | null;
  timeWindowLabel: string | null;
  technicianName: string | null;
  status: AppointmentStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type JobRow = {
  id: string;
  jobNumber: string;
  locationId: string;
  locationName: string;
  billToCustomerId: string;
  billToCustomerName: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  status: JobStatus;
  workOrderNumber: string | null;
  appointmentCount: string | number;
  nextAppointmentId: string | null;
  nextAppointmentJobId: string | null;
  nextAppointmentJobNumber: string | null;
  nextAppointmentScheduledDate: string | Date | null;
  nextAppointmentScheduledStartTime: string | Date | null;
  nextAppointmentScheduledEndTime: string | Date | null;
  nextAppointmentTimeWindowLabel: string | null;
  nextAppointmentTechnicianName: string | null;
  nextAppointmentStatus: AppointmentStatus | null;
  nextAppointmentCreatedAt: string | Date | null;
  nextAppointmentUpdatedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type InvoiceRow = {
  id: string;
  jobId: string;
  jobNumber: string;
  invoiceKind: CrmOperationalInvoiceSummary['invoiceKind'];
  status: CrmOperationalInvoiceSummary['status'];
  total: string | number;
  costComplete: boolean;
  postedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type EstimateRow = {
  id: string;
  jobId: string;
  jobNumber: string;
  status: CrmOperationalEstimateSummary['status'];
  title: string;
  total: string | number;
  costComplete: boolean;
  validUntil: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type EquipmentRow = {
  id: string;
  locationId: string | null;
  locationName: string | null;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string | null;
  status: EquipmentStatus;
  installDate: string | Date | null;
  updatedAt: string | Date;
};

@Injectable()
export class CrmOperationalDataRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async getLocationOperationalContext(
    locationId: string,
    options: CrmOperationalOptions = {}
  ): Promise<CrmOperationalContext> {
    const summary = await this.getLocationSummary(locationId);
    const jobs = await this.listJobsForLocation(locationId);
    const jobIds = jobs.map((job) => job.id);
    const includeAgreementContext = options.includeAgreementContext === true;
    const [appointments, invoices, estimates, equipment, agreements, agreementCounts, activity] =
      await Promise.all([
        this.listAppointmentsForJobs(jobIds),
        this.listInvoicesForJobs(jobIds),
        this.listEstimatesForJobs(jobIds),
        this.listEquipmentForLocation(locationId),
        includeAgreementContext
          ? listCrmAgreementsForLocation(this.databaseService, locationId)
          : Promise.resolve([]),
        includeAgreementContext
          ? getCrmAgreementCountsForLocation(this.databaseService, locationId)
          : Promise.resolve(emptyAgreementCounts()),
        listCrmActivityForLocation(this.databaseService, locationId, crmActivityLimit)
      ]);

    return {
      agreementContextVisible: includeAgreementContext,
      summary: this.withAgreementCounts(summary, agreementCounts),
      jobs,
      appointments,
      invoices,
      estimates,
      equipment,
      agreements,
      activity
    };
  }

  async getCustomerOperationalContext(
    customerId: string,
    options: CrmOperationalOptions = {}
  ): Promise<CrmOperationalContext> {
    const summary = await this.getCustomerSummary(customerId);
    const jobs = await this.listJobsForCustomer(customerId);
    const jobIds = jobs.map((job) => job.id);
    const includeAgreementContext = options.includeAgreementContext === true;
    const [appointments, invoices, estimates, equipment, agreements, agreementCounts, activity] =
      await Promise.all([
        this.listAppointmentsForJobs(jobIds),
        this.listInvoicesForJobs(jobIds),
        this.listEstimatesForJobs(jobIds),
        this.listEquipmentForCustomer(customerId),
        includeAgreementContext
          ? listCrmAgreementsForCustomer(this.databaseService, customerId)
          : Promise.resolve([]),
        includeAgreementContext
          ? getCrmAgreementCountsForCustomer(this.databaseService, customerId)
          : Promise.resolve(emptyAgreementCounts()),
        listCrmActivityForCustomer(this.databaseService, customerId, crmActivityLimit)
      ]);

    return {
      agreementContextVisible: includeAgreementContext,
      summary: this.withAgreementCounts(summary, agreementCounts),
      jobs,
      appointments,
      invoices,
      estimates,
      equipment,
      agreements,
      activity
    };
  }

  private async getLocationSummary(locationId: string): Promise<CrmOperationalSummary> {
    const result = await this.databaseService.query<SummaryRow>(
      `
        with scoped_jobs as (
          select id, status
          from jobs
          where location_id = $1
        )
        select
          (select count(*) from scoped_jobs where status in (${activeJobSqlList})) as "openJobCount",
          (
            select max(appointment.scheduled_date)
            from appointments appointment
            inner join scoped_jobs job on job.id = appointment.job_id
            where appointment.status = 'finished'
              and appointment.scheduled_date is not null
          ) as "lastServiceAt",
          (
            select count(*)
            from equipment
            where equipment.location_id = $1
              and equipment.status not in ('inactive', 'removed')
          ) as "equipmentCount",
          (
            select count(*)
            from appointments appointment
            inner join scoped_jobs job on job.id = appointment.job_id
          ) as "appointmentCount",
          (
            select count(*)
            from invoices invoice
            inner join scoped_jobs job on job.id = invoice.job_id
          ) as "invoiceCount",
          (
            select count(*)
            from estimates estimate
            inner join scoped_jobs job on job.id = estimate.job_id
          ) as "estimateCount"
      `,
      [locationId]
    );

    return this.toSummary(result.rows[0]);
  }

  private async getCustomerSummary(customerId: string): Promise<CrmOperationalSummary> {
    const result = await this.databaseService.query<SummaryRow>(
      `
        with scoped_jobs as (
          select job.id, job.status
          from jobs job
          inner join locations location on location.id = job.location_id
          where location.customer_id = $1
             or job.bill_to_customer_id = $1
        )
        select
          (select count(*) from scoped_jobs where status in (${activeJobSqlList})) as "openJobCount",
          (
            select max(appointment.scheduled_date)
            from appointments appointment
            inner join scoped_jobs job on job.id = appointment.job_id
            where appointment.status = 'finished'
              and appointment.scheduled_date is not null
          ) as "lastServiceAt",
          (
            select count(*)
            from equipment
            inner join locations location on location.id = equipment.location_id
            where location.customer_id = $1
              and equipment.status not in ('inactive', 'removed')
          ) as "equipmentCount",
          (
            select count(*)
            from appointments appointment
            inner join scoped_jobs job on job.id = appointment.job_id
          ) as "appointmentCount",
          (
            select count(*)
            from invoices invoice
            inner join scoped_jobs job on job.id = invoice.job_id
          ) as "invoiceCount",
          (
            select count(*)
            from estimates estimate
            inner join scoped_jobs job on job.id = estimate.job_id
          ) as "estimateCount"
      `,
      [customerId]
    );

    return this.toSummary(result.rows[0]);
  }

  private async listJobsForLocation(locationId: string): Promise<CrmOperationalJobSummary[]> {
    const result = await this.databaseService.query<JobRow>(
      this.getJobsSelectSql('where job.location_id = $1'),
      [locationId, crmJobLimit]
    );

    return result.rows.map((row) => this.toJobSummary(row));
  }

  private async listJobsForCustomer(customerId: string): Promise<CrmOperationalJobSummary[]> {
    const result = await this.databaseService.query<JobRow>(
      this.getJobsSelectSql('where location.customer_id = $1 or job.bill_to_customer_id = $1'),
      [customerId, crmJobLimit]
    );

    return result.rows.map((row) => this.toJobSummary(row));
  }

  private getJobsSelectSql(whereClause: string): string {
    return `
      select
        job.id,
        job.job_number as "jobNumber",
        job.location_id as "locationId",
        location.name as "locationName",
        job.bill_to_customer_id as "billToCustomerId",
        bill_to_customer.name as "billToCustomerName",
        job.job_type as "jobType",
        job.category,
        job.origin,
        job.summary,
        job.status,
        job.work_order_number as "workOrderNumber",
        (
          select count(*)
          from appointments appointment_count
          where appointment_count.job_id = job.id
        ) as "appointmentCount",
        next_appointment.id as "nextAppointmentId",
        next_appointment.job_id as "nextAppointmentJobId",
        job.job_number as "nextAppointmentJobNumber",
        next_appointment.scheduled_date as "nextAppointmentScheduledDate",
        next_appointment.scheduled_start_time as "nextAppointmentScheduledStartTime",
        next_appointment.scheduled_end_time as "nextAppointmentScheduledEndTime",
        next_appointment.time_window_label as "nextAppointmentTimeWindowLabel",
        next_technician.display_name as "nextAppointmentTechnicianName",
        next_appointment.status as "nextAppointmentStatus",
        next_appointment.created_at as "nextAppointmentCreatedAt",
        next_appointment.updated_at as "nextAppointmentUpdatedAt",
        job.created_at as "createdAt",
        job.updated_at as "updatedAt"
      from jobs job
      inner join locations location on location.id = job.location_id
      inner join customers bill_to_customer on bill_to_customer.id = job.bill_to_customer_id
      left join lateral (
        select appointment.*
        from appointments appointment
        where appointment.job_id = job.id
          and appointment.status <> 'cancelled'
        order by
          appointment.scheduled_date asc nulls last,
          appointment.scheduled_start_time asc nulls last,
          appointment.created_at asc
        limit 1
      ) next_appointment on true
      left join employees next_technician on next_technician.id = next_appointment.technician_id
      ${whereClause}
      order by
        case when job.status in (${activeJobSqlList}) then 0 else 1 end asc,
        job.updated_at desc,
        job.job_number desc
      limit $2
    `;
  }

  private async listAppointmentsForJobs(
    jobIds: string[]
  ): Promise<CrmOperationalAppointmentSummary[]> {
    if (jobIds.length === 0) {
      return [];
    }

    const result = await this.databaseService.query<AppointmentRow>(
      `
        select
          appointment.id,
          appointment.job_id as "jobId",
          job.job_number as "jobNumber",
          appointment.scheduled_date as "scheduledDate",
          appointment.scheduled_start_time as "scheduledStartTime",
          appointment.scheduled_end_time as "scheduledEndTime",
          appointment.time_window_label as "timeWindowLabel",
          technician.display_name as "technicianName",
          appointment.status,
          appointment.created_at as "createdAt",
          appointment.updated_at as "updatedAt"
        from appointments appointment
        inner join jobs job on job.id = appointment.job_id
        left join employees technician on technician.id = appointment.technician_id
        where appointment.job_id = any($1::text[])
        order by
          appointment.scheduled_date desc nulls last,
          appointment.scheduled_start_time desc nulls last,
          appointment.updated_at desc
        limit $2
      `,
      [jobIds, crmAppointmentLimit]
    );

    return result.rows.map((row) => this.toAppointmentSummary(row));
  }

  private async listInvoicesForJobs(jobIds: string[]): Promise<CrmOperationalInvoiceSummary[]> {
    if (jobIds.length === 0) {
      return [];
    }

    const result = await this.databaseService.query<InvoiceRow>(
      `
        select
          invoice.id,
          invoice.job_id as "jobId",
          job.job_number as "jobNumber",
          invoice.invoice_kind as "invoiceKind",
          invoice.status,
          invoice.total_amount as "total",
          invoice.cost_complete as "costComplete",
          invoice.posted_at as "postedAt",
          invoice.created_at as "createdAt",
          invoice.updated_at as "updatedAt"
        from invoices invoice
        inner join jobs job on job.id = invoice.job_id
        where invoice.job_id = any($1::text[])
        order by invoice.updated_at desc, invoice.created_at desc
        limit $2
      `,
      [jobIds, crmInvoiceLimit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      jobNumber: row.jobNumber,
      invoiceKind: row.invoiceKind,
      status: row.status,
      total: Number(row.total),
      costComplete: row.costComplete,
      postedAt: row.postedAt ? toIsoString(row.postedAt) : undefined,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    }));
  }

  private async listEstimatesForJobs(jobIds: string[]): Promise<CrmOperationalEstimateSummary[]> {
    if (jobIds.length === 0) {
      return [];
    }

    const result = await this.databaseService.query<EstimateRow>(
      `
        select
          estimate.id,
          estimate.job_id as "jobId",
          job.job_number as "jobNumber",
          estimate.status,
          estimate.title,
          estimate.total_amount as "total",
          estimate.cost_complete as "costComplete",
          estimate.valid_until as "validUntil",
          estimate.created_at as "createdAt",
          estimate.updated_at as "updatedAt"
        from estimates estimate
        inner join jobs job on job.id = estimate.job_id
        where estimate.job_id = any($1::text[])
        order by estimate.updated_at desc, estimate.created_at desc
        limit $2
      `,
      [jobIds, crmEstimateLimit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      jobNumber: row.jobNumber,
      status: row.status,
      title: row.title,
      total: Number(row.total),
      costComplete: row.costComplete,
      validUntil: toOptionalDateString(row.validUntil),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    }));
  }

  private async listEquipmentForLocation(
    locationId: string
  ): Promise<CrmOperationalEquipmentSummary[]> {
    const result = await this.databaseService.query<EquipmentRow>(
      `
        select
          equipment.id,
          equipment.location_id as "locationId",
          location.name as "locationName",
          equipment.equipment_type as "equipmentType",
          equipment.brand,
          equipment.model,
          equipment.serial_number as "serialNumber",
          equipment.status,
          equipment.install_date as "installDate",
          equipment.updated_at as "updatedAt"
        from equipment
        left join locations location on location.id = equipment.location_id
        where equipment.location_id = $1
        order by
          case when equipment.status in ('active', 'pendingInstall') then 0 else 1 end asc,
          equipment.updated_at desc
        limit $2
      `,
      [locationId, crmEquipmentLimit]
    );

    return result.rows.map((row) => this.toEquipmentSummary(row));
  }

  private async listEquipmentForCustomer(
    customerId: string
  ): Promise<CrmOperationalEquipmentSummary[]> {
    const result = await this.databaseService.query<EquipmentRow>(
      `
        select
          equipment.id,
          equipment.location_id as "locationId",
          location.name as "locationName",
          equipment.equipment_type as "equipmentType",
          equipment.brand,
          equipment.model,
          equipment.serial_number as "serialNumber",
          equipment.status,
          equipment.install_date as "installDate",
          equipment.updated_at as "updatedAt"
        from equipment
        inner join locations location on location.id = equipment.location_id
        where location.customer_id = $1
        order by
          case when equipment.status in ('active', 'pendingInstall') then 0 else 1 end asc,
          equipment.updated_at desc
        limit $2
      `,
      [customerId, crmEquipmentLimit]
    );

    return result.rows.map((row) => this.toEquipmentSummary(row));
  }

  private toSummary(row: SummaryRow | undefined): CrmOperationalSummary {
    return {
      openJobCount: Number(row?.openJobCount ?? 0),
      lastServiceAt: toOptionalDateString(row?.lastServiceAt),
      equipmentCount: Number(row?.equipmentCount ?? 0),
      appointmentCount: Number(row?.appointmentCount ?? 0),
      invoiceCount: Number(row?.invoiceCount ?? 0),
      estimateCount: Number(row?.estimateCount ?? 0),
      activeAgreementCount: 0,
      endedAgreementCount: 0
    };
  }

  private withAgreementCounts(
    summary: CrmOperationalSummary,
    agreementCounts: Pick<CrmOperationalSummary, 'activeAgreementCount' | 'endedAgreementCount'>
  ): CrmOperationalSummary {
    return {
      ...summary,
      ...agreementCounts
    };
  }

  private toJobSummary(row: JobRow): CrmOperationalJobSummary {
    const nextAppointment =
      row.nextAppointmentId && row.nextAppointmentJobId && row.nextAppointmentStatus
        ? this.toAppointmentSummary({
            id: row.nextAppointmentId,
            jobId: row.nextAppointmentJobId,
            jobNumber: row.nextAppointmentJobNumber ?? row.jobNumber,
            scheduledDate: row.nextAppointmentScheduledDate,
            scheduledStartTime: row.nextAppointmentScheduledStartTime,
            scheduledEndTime: row.nextAppointmentScheduledEndTime,
            timeWindowLabel: row.nextAppointmentTimeWindowLabel,
            technicianName: row.nextAppointmentTechnicianName,
            status: row.nextAppointmentStatus,
            createdAt: row.nextAppointmentCreatedAt ?? row.createdAt,
            updatedAt: row.nextAppointmentUpdatedAt ?? row.updatedAt
          })
        : undefined;

    return {
      id: row.id,
      jobNumber: row.jobNumber,
      locationId: row.locationId,
      locationName: row.locationName,
      billToCustomerId: row.billToCustomerId,
      billToCustomerName: row.billToCustomerName,
      jobType: row.jobType,
      category: row.category,
      origin: row.origin,
      summary: row.summary,
      status: row.status,
      workOrderNumber: row.workOrderNumber ?? undefined,
      appointmentCount: Number(row.appointmentCount),
      nextAppointment,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }

  private toAppointmentSummary(row: AppointmentRow): CrmOperationalAppointmentSummary {
    return {
      id: row.id,
      jobId: row.jobId,
      jobNumber: row.jobNumber,
      scheduledDate: toOptionalDateString(row.scheduledDate),
      scheduledStartTime: toOptionalTimeString(row.scheduledStartTime),
      scheduledEndTime: toOptionalTimeString(row.scheduledEndTime),
      timeWindowLabel: row.timeWindowLabel ?? undefined,
      technicianName: row.technicianName ?? undefined,
      status: row.status,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }

  private toEquipmentSummary(row: EquipmentRow): CrmOperationalEquipmentSummary {
    return {
      id: row.id,
      locationId: row.locationId ?? undefined,
      locationName: row.locationName ?? undefined,
      equipmentType: row.equipmentType,
      brand: row.brand,
      model: row.model,
      serialNumber: row.serialNumber ?? undefined,
      status: row.status,
      installDate: toOptionalDateString(row.installDate),
      updatedAt: toIsoString(row.updatedAt)
    };
  }
}

function emptyAgreementCounts(): Pick<
  CrmOperationalSummary,
  'activeAgreementCount' | 'endedAgreementCount'
> {
  return { activeAgreementCount: 0, endedAgreementCount: 0 };
}
