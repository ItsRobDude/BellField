import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CatalogItemKind,
  CatalogLineSnapshot,
  ServiceAgreementCoveredEquipment,
  ServiceAgreementCoveredLocation,
  ServiceAgreementVisitTemplate
} from '@bellfield/contracts';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString, toOptionalDateString } from '../../database/database-row.utils';
import type {
  CreateServiceAgreementRequestDto,
  ServiceAgreementActor,
  ServiceAgreementDto,
  ServiceAgreementListFilters,
  ServiceAgreementStatusValue,
  ServiceAgreementVisitTemplateInputDto
} from './service-agreements.types';

type ServiceAgreementHeaderRow = {
  id: string;
  agreementNumber: string;
  customerId: string;
  customerName: string;
  name: string;
  description: string | null;
  status: ServiceAgreementStatusValue;
  sourceCatalogItemId: string | null;
  sourceCatalogSnapshot: CatalogLineSnapshot | null;
  sourceEstimateId: string | null;
  sourceEstimateLineItemId: string | null;
  startDate: string | Date | null;
  endDate: string | Date | null;
  renewalDate: string | Date | null;
  billingCadence: ServiceAgreementDto['billingCadence'];
  nextBillingDate: string | Date | null;
  billingAmount: string | number | null;
  statusNote: string | null;
  activatedAt: string | Date | null;
  pausedAt: string | Date | null;
  endedAt: string | Date | null;
  createdByName: string;
  updatedByName: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type CoveredLocationRow = {
  id: string;
  agreementId: string;
  locationId: string;
  locationName: string;
  createdAt: string | Date;
};

type CoveredEquipmentRow = {
  id: string;
  agreementId: string;
  equipmentId: string;
  locationId: string;
  locationName: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string | null;
  createdAt: string | Date;
};

type VisitTemplateRow = {
  id: string;
  agreementId: string;
  title: string;
  frequency: ServiceAgreementVisitTemplate['frequency'];
  intervalMonths: number | null;
  preferredMonth: number | null;
  preferredDayOfMonth: number | null;
  timeWindowLabel: string | null;
  jobType: string | null;
  category: string | null;
  summary: string | null;
  estimatedDurationMinutes: number | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const AGREEMENT_HEADER_SELECT = `
  select
    sa.id,
    sa.agreement_number as "agreementNumber",
    sa.customer_id as "customerId",
    c.name as "customerName",
    sa.name,
    sa.description,
    sa.status,
    sa.source_catalog_item_id as "sourceCatalogItemId",
    sa.source_catalog_snapshot as "sourceCatalogSnapshot",
    sa.source_estimate_id as "sourceEstimateId",
    sa.source_estimate_line_item_id as "sourceEstimateLineItemId",
    sa.start_date as "startDate",
    sa.end_date as "endDate",
    sa.renewal_date as "renewalDate",
    sa.billing_cadence as "billingCadence",
    sa.next_billing_date as "nextBillingDate",
    sa.billing_amount as "billingAmount",
    sa.status_note as "statusNote",
    sa.activated_at as "activatedAt",
    sa.paused_at as "pausedAt",
    sa.ended_at as "endedAt",
    sa.created_by_name as "createdByName",
    sa.updated_by_name as "updatedByName",
    sa.created_at as "createdAt",
    sa.updated_at as "updatedAt"
  from service_agreements sa
  join customers c on c.id = sa.customer_id
`;

@Injectable()
export class ServiceAgreementsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listAgreements(filters: ServiceAgreementListFilters): Promise<ServiceAgreementDto[]> {
    const result = await this.databaseService.query<ServiceAgreementHeaderRow>(
      `${AGREEMENT_HEADER_SELECT}
       where ($1::text is null or sa.customer_id = $1)
         and ($2::text is null or exists (
           select 1 from service_agreement_covered_locations acl
           where acl.agreement_id = sa.id and acl.location_id = $2
         ))
         and ($3::text is null or sa.status = $3)
       order by
         case sa.status when 'active' then 0 when 'draft' then 1 when 'paused' then 2 else 3 end,
         sa.renewal_date nulls last,
         sa.agreement_number asc`,
      [filters.customerId ?? null, filters.locationId ?? null, filters.status ?? null]
    );

    return this.hydrateAgreementRows(result.rows);
  }

  async getAgreementById(agreementId: string): Promise<ServiceAgreementDto | null> {
    const result = await this.databaseService.query<ServiceAgreementHeaderRow>(
      `${AGREEMENT_HEADER_SELECT} where sa.id = $1 limit 1`,
      [agreementId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return (await this.hydrateAgreementRows([row]))[0] ?? null;
  }

  async createAgreement(
    input: CreateServiceAgreementRequestDto,
    actor: ServiceAgreementActor
  ): Promise<ServiceAgreementDto> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.databaseService.transaction(async (queryable) => {
      const agreementNumber = await this.nextAgreementNumber(queryable);
      await queryable.query(
        `insert into service_agreements (
           id, agreement_number, customer_id, name, description, status,
           source_catalog_item_id, source_catalog_snapshot, source_estimate_id,
           source_estimate_line_item_id, start_date, end_date, renewal_date,
           billing_cadence, next_billing_date, billing_amount,
           created_by_employee_id, created_by_name, updated_by_employee_id, updated_by_name,
           created_at, updated_at
         )
         values (
           $1, $2, $3, $4, $5, 'draft',
           $6, $7::jsonb, $8,
           $9, $10, $11, $12,
           $13, $14, $15,
           $16, $17, $16, $17,
           $18, $18
         )`,
        [
          id,
          agreementNumber,
          input.customerId,
          input.name.trim(),
          cleanOptionalString(input.description),
          cleanOptionalString(input.sourceCatalogItemId),
          input.sourceCatalogSnapshot ? JSON.stringify(input.sourceCatalogSnapshot) : null,
          cleanOptionalString(input.sourceEstimateId),
          cleanOptionalString(input.sourceEstimateLineItemId),
          input.startDate ?? null,
          input.endDate ?? null,
          input.renewalDate ?? null,
          input.billingCadence ?? 'none',
          input.nextBillingDate ?? null,
          input.billingAmount ?? null,
          actor.id,
          actor.displayName,
          now
        ]
      );

      await this.replaceCoverageAndTemplates(id, input, now, queryable);
    });

    return (await this.getAgreementById(id))!;
  }

  async updateAgreement(
    agreementId: string,
    input: CreateServiceAgreementRequestDto,
    actor: ServiceAgreementActor
  ): Promise<ServiceAgreementDto> {
    const now = new Date().toISOString();
    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `update service_agreements
         set
           name = $2,
           description = $3,
           source_catalog_item_id = $4,
           source_catalog_snapshot = $5::jsonb,
           source_estimate_id = $6,
           source_estimate_line_item_id = $7,
           start_date = $8,
           end_date = $9,
           renewal_date = $10,
           billing_cadence = $11,
           next_billing_date = $12,
           billing_amount = $13,
           updated_by_employee_id = $14,
           updated_by_name = $15,
           updated_at = $16
         where id = $1`,
        [
          agreementId,
          input.name!.trim(),
          cleanOptionalString(input.description),
          cleanOptionalString(input.sourceCatalogItemId),
          input.sourceCatalogSnapshot ? JSON.stringify(input.sourceCatalogSnapshot) : null,
          cleanOptionalString(input.sourceEstimateId),
          cleanOptionalString(input.sourceEstimateLineItemId),
          input.startDate ?? null,
          input.endDate ?? null,
          input.renewalDate ?? null,
          input.billingCadence ?? 'none',
          input.nextBillingDate ?? null,
          input.billingAmount ?? null,
          actor.id,
          actor.displayName,
          now
        ]
      );

      await this.replaceCoverageAndTemplates(agreementId, input, now, queryable);
    });

    return (await this.getAgreementById(agreementId))!;
  }

  async changeAgreementStatus(
    agreementId: string,
    nextStatus: ServiceAgreementStatusValue,
    allowedStatuses: readonly ServiceAgreementStatusValue[],
    occurredAt: string,
    reason: string | undefined,
    actor: ServiceAgreementActor
  ): Promise<boolean> {
    return this.databaseService.transaction(async (queryable) => {
      const currentResult = await queryable.query<{ status: ServiceAgreementStatusValue }>(
        `select status from service_agreements where id = $1 for update`,
        [agreementId]
      );
      const current = currentResult.rows[0];
      if (!current || !allowedStatuses.includes(current.status)) {
        return false;
      }

      const activatedAtSql = nextStatus === 'active' ? '$3' : 'activated_at';
      const pausedAtSql = nextStatus === 'paused' ? '$3' : 'paused_at';
      const endedAtSql = nextStatus === 'ended' ? '$3' : 'ended_at';
      await queryable.query(
        `update service_agreements
         set status = $2,
             status_note = $4,
             activated_at = ${activatedAtSql},
             paused_at = ${pausedAtSql},
             ended_at = ${endedAtSql},
             updated_by_employee_id = $5,
             updated_by_name = $6,
             updated_at = $3
         where id = $1`,
        [
          agreementId,
          nextStatus,
          occurredAt,
          cleanOptionalString(reason),
          actor.id,
          actor.displayName
        ]
      );
      return true;
    });
  }

  async getCatalogItemKind(itemId: string): Promise<CatalogItemKind | null> {
    const result = await this.databaseService.query<{ kind: CatalogItemKind }>(
      `select kind from catalog_items where id = $1 limit 1`,
      [itemId]
    );
    return result.rows[0]?.kind ?? null;
  }

  async estimateExists(estimateId: string): Promise<boolean> {
    const result = await this.databaseService.query(
      `select id from estimates where id = $1 limit 1`,
      [estimateId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async estimateLineExists(estimateLineItemId: string, estimateId?: string): Promise<boolean> {
    const result = await this.databaseService.query(
      `select id from estimate_line_items
       where id = $1 and ($2::text is null or estimate_id = $2)
       limit 1`,
      [estimateLineItemId, estimateId ?? null]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async replaceCoverageAndTemplates(
    agreementId: string,
    input: {
      coveredLocationIds: string[];
      coveredEquipmentIds?: string[];
      visitTemplates?: ServiceAgreementVisitTemplateInputDto[];
    },
    now: string,
    queryable: QueryExecutor
  ): Promise<void> {
    await queryable.query(`delete from service_agreement_visit_templates where agreement_id = $1`, [
      agreementId
    ]);
    await queryable.query(
      `delete from service_agreement_covered_equipment where agreement_id = $1`,
      [agreementId]
    );
    await queryable.query(
      `delete from service_agreement_covered_locations where agreement_id = $1`,
      [agreementId]
    );

    for (const locationId of input.coveredLocationIds) {
      await queryable.query(
        `insert into service_agreement_covered_locations (id, agreement_id, location_id, created_at)
         values ($1, $2, $3, $4)`,
        [randomUUID(), agreementId, locationId, now]
      );
    }

    for (const equipmentId of input.coveredEquipmentIds ?? []) {
      await queryable.query(
        `insert into service_agreement_covered_equipment (id, agreement_id, equipment_id, created_at)
         values ($1, $2, $3, $4)`,
        [randomUUID(), agreementId, equipmentId, now]
      );
    }

    for (const template of input.visitTemplates ?? []) {
      await this.insertVisitTemplate(agreementId, template, now, queryable);
    }
  }

  private async insertVisitTemplate(
    agreementId: string,
    template: ServiceAgreementVisitTemplateInputDto,
    now: string,
    queryable: QueryExecutor
  ): Promise<void> {
    await queryable.query(
      `insert into service_agreement_visit_templates (
         id, agreement_id, title, frequency, interval_months, preferred_month,
         preferred_day_of_month, time_window_label, job_type, category, summary,
         estimated_duration_minutes, is_active, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)`,
      [
        randomUUID(),
        agreementId,
        template.title.trim(),
        template.frequency,
        template.intervalMonths ?? null,
        template.preferredMonth ?? null,
        template.preferredDayOfMonth ?? null,
        cleanOptionalString(template.timeWindowLabel),
        cleanOptionalString(template.jobType),
        cleanOptionalString(template.category),
        cleanOptionalString(template.summary),
        template.estimatedDurationMinutes ?? null,
        template.isActive ?? true,
        now
      ]
    );
  }

  private async hydrateAgreementRows(
    rows: ServiceAgreementHeaderRow[]
  ): Promise<ServiceAgreementDto[]> {
    if (rows.length === 0) {
      return [];
    }

    const agreementIds = rows.map((row) => row.id);
    const [coveredLocations, coveredEquipment, visitTemplates] = await Promise.all([
      this.listCoveredLocations(agreementIds),
      this.listCoveredEquipment(agreementIds),
      this.listVisitTemplates(agreementIds)
    ]);

    return rows.map((row) =>
      toServiceAgreement(row, {
        coveredLocations: coveredLocations.get(row.id) ?? [],
        coveredEquipment: coveredEquipment.get(row.id) ?? [],
        visitTemplates: visitTemplates.get(row.id) ?? []
      })
    );
  }

  private async listCoveredLocations(
    agreementIds: string[]
  ): Promise<Map<string, ServiceAgreementCoveredLocation[]>> {
    const result = await this.databaseService.query<CoveredLocationRow>(
      `select
         acl.id,
         acl.agreement_id as "agreementId",
         acl.location_id as "locationId",
         loc.name as "locationName",
         acl.created_at as "createdAt"
       from service_agreement_covered_locations acl
       join locations loc on loc.id = acl.location_id
       where acl.agreement_id = any($1::text[])
       order by loc.name asc, acl.id asc`,
      [agreementIds]
    );

    return groupByAgreement(result.rows.map(toCoveredLocation));
  }

  private async listCoveredEquipment(
    agreementIds: string[]
  ): Promise<Map<string, ServiceAgreementCoveredEquipment[]>> {
    const result = await this.databaseService.query<CoveredEquipmentRow>(
      `select
         ace.id,
         ace.agreement_id as "agreementId",
         ace.equipment_id as "equipmentId",
         equipment.location_id as "locationId",
         loc.name as "locationName",
         equipment.equipment_type as "equipmentType",
         equipment.brand,
         equipment.model,
         equipment.serial_number as "serialNumber",
         ace.created_at as "createdAt"
       from service_agreement_covered_equipment ace
       join equipment on equipment.id = ace.equipment_id
       join locations loc on loc.id = equipment.location_id
       where ace.agreement_id = any($1::text[])
       order by loc.name asc, equipment.equipment_type asc, ace.id asc`,
      [agreementIds]
    );

    return groupByAgreement(result.rows.map(toCoveredEquipment));
  }

  private async listVisitTemplates(
    agreementIds: string[]
  ): Promise<Map<string, ServiceAgreementVisitTemplate[]>> {
    const result = await this.databaseService.query<VisitTemplateRow>(
      `select
         id,
         agreement_id as "agreementId",
         title,
         frequency,
         interval_months as "intervalMonths",
         preferred_month as "preferredMonth",
         preferred_day_of_month as "preferredDayOfMonth",
         time_window_label as "timeWindowLabel",
         job_type as "jobType",
         category,
         summary,
         estimated_duration_minutes as "estimatedDurationMinutes",
         is_active as "isActive",
         created_at as "createdAt",
         updated_at as "updatedAt"
       from service_agreement_visit_templates
       where agreement_id = any($1::text[])
       order by is_active desc, title asc, id asc`,
      [agreementIds]
    );

    return groupByAgreement(result.rows.map(toVisitTemplate));
  }

  private async nextAgreementNumber(queryable: QueryExecutor): Promise<string> {
    const result = await queryable.query<{ nextNumber: string | number }>(
      `select nextval('service_agreement_number_sequence') as "nextNumber"`
    );
    const nextNumber = Number(result.rows[0]?.nextNumber ?? 0);
    return `SA-${String(nextNumber).padStart(4, '0')}`;
  }
}

function toServiceAgreement(
  row: ServiceAgreementHeaderRow,
  children: Pick<ServiceAgreementDto, 'coveredLocations' | 'coveredEquipment' | 'visitTemplates'>
): ServiceAgreementDto {
  return {
    id: row.id,
    agreementNumber: row.agreementNumber,
    customerId: row.customerId,
    customerName: row.customerName,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status,
    sourceCatalogItemId: row.sourceCatalogItemId ?? undefined,
    sourceCatalogSnapshot: row.sourceCatalogSnapshot ?? undefined,
    sourceEstimateId: row.sourceEstimateId ?? undefined,
    sourceEstimateLineItemId: row.sourceEstimateLineItemId ?? undefined,
    startDate: toOptionalDateString(row.startDate),
    endDate: toOptionalDateString(row.endDate),
    renewalDate: toOptionalDateString(row.renewalDate),
    billingCadence: row.billingCadence,
    nextBillingDate: toOptionalDateString(row.nextBillingDate),
    billingAmount: toOptionalNumber(row.billingAmount),
    statusNote: row.statusNote ?? undefined,
    activatedAt: row.activatedAt ? toIsoString(row.activatedAt) : undefined,
    pausedAt: row.pausedAt ? toIsoString(row.pausedAt) : undefined,
    endedAt: row.endedAt ? toIsoString(row.endedAt) : undefined,
    createdByName: row.createdByName,
    updatedByName: row.updatedByName,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    ...children
  };
}

function toCoveredLocation(row: CoveredLocationRow): ServiceAgreementCoveredLocation {
  return {
    id: row.id,
    agreementId: row.agreementId,
    locationId: row.locationId,
    locationName: row.locationName,
    createdAt: toIsoString(row.createdAt)
  };
}

function toCoveredEquipment(row: CoveredEquipmentRow): ServiceAgreementCoveredEquipment {
  return {
    id: row.id,
    agreementId: row.agreementId,
    equipmentId: row.equipmentId,
    equipmentLabel: formatEquipmentLabel(row),
    locationId: row.locationId,
    locationName: row.locationName,
    createdAt: toIsoString(row.createdAt)
  };
}

function toVisitTemplate(row: VisitTemplateRow): ServiceAgreementVisitTemplate {
  return {
    id: row.id,
    agreementId: row.agreementId,
    title: row.title,
    frequency: row.frequency,
    intervalMonths: row.intervalMonths ?? undefined,
    preferredMonth: row.preferredMonth ?? undefined,
    preferredDayOfMonth: row.preferredDayOfMonth ?? undefined,
    timeWindowLabel: row.timeWindowLabel ?? undefined,
    jobType: row.jobType ?? undefined,
    category: row.category ?? undefined,
    summary: row.summary ?? undefined,
    estimatedDurationMinutes: row.estimatedDurationMinutes ?? undefined,
    isActive: row.isActive,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function groupByAgreement<T extends { agreementId: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    grouped.set(item.agreementId, [...(grouped.get(item.agreementId) ?? []), item]);
  }
  return grouped;
}

function toOptionalNumber(value: string | number | null): number | undefined {
  return value === null ? undefined : Number(value);
}

function formatEquipmentLabel(row: CoveredEquipmentRow): string {
  const serial = row.serialNumber ? ` (${row.serialNumber})` : '';
  return `${row.equipmentType} - ${row.brand} ${row.model}${serial}`;
}

function cleanOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}
