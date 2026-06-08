import { Injectable } from '@nestjs/common';
import type {
  FieldAgreementCoverageEquipment,
  FieldAgreementCoverageLocation,
  FieldAgreementCoverageSummary,
  FieldAgreementCoverageVisitTemplate
} from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { toOptionalDateString } from '../../database/database-row.utils';

type FieldAgreementHeaderRow = {
  agreementId: string;
  agreementNumber: string;
  customerId: string;
  customerName: string;
  name: string;
  description: string | null;
  renewalDate: string | Date | null;
};

type FieldAgreementLocationRow = {
  agreementId: string;
  locationId: string;
  locationName: string;
};

type FieldAgreementEquipmentRow = {
  agreementId: string;
  equipmentId: string;
  locationId: string;
  locationName: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string | null;
};

type FieldAgreementVisitTemplateRow = {
  agreementId: string;
  title: string;
  frequency: FieldAgreementCoverageVisitTemplate['frequency'];
  intervalMonths: number | null;
  preferredMonth: number | null;
  preferredDayOfMonth: number | null;
  timeWindowLabel: string | null;
  jobType: string | null;
  category: string | null;
  summary: string | null;
  estimatedDurationMinutes: number | null;
};

@Injectable()
export class FieldAgreementCoverageRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listActiveCoverageForLocations(
    locationIds: string[]
  ): Promise<FieldAgreementCoverageSummary[]> {
    const scopedLocationIds = [...new Set(locationIds)].filter(Boolean);
    if (scopedLocationIds.length === 0) {
      return [];
    }

    const headerResult = await this.databaseService.query<FieldAgreementHeaderRow>(
      `select distinct
         agreement.id as "agreementId",
         agreement.agreement_number as "agreementNumber",
         agreement.customer_id as "customerId",
         customer.name as "customerName",
         agreement.name,
         agreement.description,
         agreement.renewal_date as "renewalDate"
       from service_agreements agreement
       inner join customers customer on customer.id = agreement.customer_id
       inner join service_agreement_covered_locations scoped_location
         on scoped_location.agreement_id = agreement.id
        and scoped_location.location_id = any($1::text[])
       where agreement.status = 'active'
       order by agreement.renewal_date nulls last, agreement.agreement_number asc`,
      [scopedLocationIds]
    );

    const agreementIds = headerResult.rows.map((row) => row.agreementId);
    if (agreementIds.length === 0) {
      return [];
    }

    const [coveredLocations, coveredEquipment, activeVisitTemplates] = await Promise.all([
      this.listCoveredLocations(agreementIds, scopedLocationIds),
      this.listCoveredEquipment(agreementIds, scopedLocationIds),
      this.listActiveVisitTemplates(agreementIds)
    ]);

    return headerResult.rows.map((row) => ({
      agreementId: row.agreementId,
      agreementNumber: row.agreementNumber,
      customerId: row.customerId,
      customerName: row.customerName,
      name: row.name,
      description: row.description ?? undefined,
      renewalDate: toOptionalDateString(row.renewalDate),
      coveredLocations: coveredLocations.get(row.agreementId) ?? [],
      coveredEquipment: coveredEquipment.get(row.agreementId) ?? [],
      activeVisitTemplates: activeVisitTemplates.get(row.agreementId) ?? []
    }));
  }

  private async listCoveredLocations(
    agreementIds: string[],
    scopedLocationIds: string[]
  ): Promise<Map<string, FieldAgreementCoverageLocation[]>> {
    const result = await this.databaseService.query<FieldAgreementLocationRow>(
      `select
         covered_location.agreement_id as "agreementId",
         covered_location.location_id as "locationId",
         location.name as "locationName"
       from service_agreement_covered_locations covered_location
       inner join locations location on location.id = covered_location.location_id
       where covered_location.agreement_id = any($1::text[])
         and covered_location.location_id = any($2::text[])
       order by location.name asc, covered_location.location_id asc`,
      [agreementIds, scopedLocationIds]
    );

    return groupByAgreement(
      result.rows.map((row) => ({
        agreementId: row.agreementId,
        locationId: row.locationId,
        locationName: row.locationName
      }))
    );
  }

  private async listCoveredEquipment(
    agreementIds: string[],
    scopedLocationIds: string[]
  ): Promise<Map<string, FieldAgreementCoverageEquipment[]>> {
    const result = await this.databaseService.query<FieldAgreementEquipmentRow>(
      `select
         covered_equipment.agreement_id as "agreementId",
         covered_equipment.equipment_id as "equipmentId",
         equipment.location_id as "locationId",
         location.name as "locationName",
         equipment.equipment_type as "equipmentType",
         equipment.brand,
         equipment.model,
         equipment.serial_number as "serialNumber"
       from service_agreement_covered_equipment covered_equipment
       inner join equipment on equipment.id = covered_equipment.equipment_id
       inner join locations location on location.id = equipment.location_id
       where covered_equipment.agreement_id = any($1::text[])
         and equipment.location_id = any($2::text[])
       order by location.name asc, equipment.equipment_type asc, covered_equipment.equipment_id asc`,
      [agreementIds, scopedLocationIds]
    );

    return groupByAgreement(
      result.rows.map((row) => ({
        agreementId: row.agreementId,
        equipmentId: row.equipmentId,
        equipmentLabel: formatEquipmentLabel(row),
        locationId: row.locationId,
        locationName: row.locationName
      }))
    );
  }

  private async listActiveVisitTemplates(
    agreementIds: string[]
  ): Promise<Map<string, FieldAgreementCoverageVisitTemplate[]>> {
    const result = await this.databaseService.query<FieldAgreementVisitTemplateRow>(
      `select
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
         estimated_duration_minutes as "estimatedDurationMinutes"
       from service_agreement_visit_templates
       where agreement_id = any($1::text[])
         and is_active = true
       order by title asc, id asc`,
      [agreementIds]
    );

    return groupByAgreement(
      result.rows.map((row) => ({
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
        estimatedDurationMinutes: row.estimatedDurationMinutes ?? undefined
      }))
    );
  }
}

function groupByAgreement<T extends { agreementId: string }>(
  items: T[]
): Map<string, Omit<T, 'agreementId'>[]> {
  const grouped = new Map<string, Omit<T, 'agreementId'>[]>();

  for (const item of items) {
    const { agreementId, ...entry } = item;
    grouped.set(agreementId, [...(grouped.get(agreementId) ?? []), entry]);
  }

  return grouped;
}

function formatEquipmentLabel(row: FieldAgreementEquipmentRow): string {
  const serial = row.serialNumber ? ` (${row.serialNumber})` : '';
  return `${row.equipmentType} - ${row.brand} ${row.model}${serial}`;
}
