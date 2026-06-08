import type {
  ServiceAgreementBillingDueReportRow,
  ServiceAgreementReportRow,
  ServiceAgreementReports,
  ServiceAgreementVisitTemplatePromptRow
} from '@bellfield/contracts';
import { toIsoString, toOptionalDateString } from '../../database/database-row.utils';
import type { DatabaseService } from '../../database/database.service';
import type { CsvColumn } from './report-csv';

type AgreementReportRow = {
  agreementId: string;
  agreementNumber: string;
  customerId: string;
  customerName: string;
  name: string;
  status: ServiceAgreementReportRow['status'];
  startDate: string | Date | null;
  endDate: string | Date | null;
  renewalDate: string | Date | null;
  billingCadence: ServiceAgreementReportRow['billingCadence'];
  nextBillingDate: string | Date | null;
  billingAmount: string | number | null;
  coveredLocationNames: string[] | null;
  coveredEquipmentCount: string | number;
  activeVisitTemplateCount: string | number;
  updatedAt: string | Date;
};

type BillingDueRow = AgreementReportRow & {
  daysUntilBilling: string | number;
};

type VisitTemplatePromptDbRow = {
  agreementId: string;
  agreementNumber: string;
  customerId: string;
  customerName: string;
  agreementName: string;
  templateId: string;
  title: string;
  frequency: ServiceAgreementVisitTemplatePromptRow['frequency'];
  preferredMonth: number | null;
  preferredDayOfMonth: number | null;
  projectedDueDate: string | Date | null;
  daysUntilProjectedDue: string | number | null;
  timeWindowLabel: string | null;
  jobType: string | null;
  category: string | null;
  summary: string | null;
  estimatedDurationMinutes: number | null;
  coveredLocationNames: string[] | null;
};

const promptWindowDays = 60;

export const SERVICE_AGREEMENT_ACTIVE_CSV_COLUMNS: CsvColumn<ServiceAgreementReportRow>[] = [
  { header: 'Agreement #', value: (row) => row.agreementNumber },
  { header: 'Customer', value: (row) => row.customerName },
  { header: 'Name', value: (row) => row.name },
  { header: 'Renewal date', value: (row) => row.renewalDate ?? '' },
  { header: 'Billing cadence', value: (row) => row.billingCadence },
  { header: 'Next billing date', value: (row) => row.nextBillingDate ?? '' },
  { header: 'Billing amount', value: (row) => row.billingAmount ?? '' },
  { header: 'Covered locations', value: (row) => row.coveredLocationNames.join('; ') },
  { header: 'Covered equipment count', value: (row) => row.coveredEquipmentCount },
  { header: 'Active visit templates', value: (row) => row.activeVisitTemplateCount }
];

export const SERVICE_AGREEMENT_EXPIRING_CSV_COLUMNS: CsvColumn<ServiceAgreementReportRow>[] = [
  ...SERVICE_AGREEMENT_ACTIVE_CSV_COLUMNS,
  { header: 'End date', value: (row) => row.endDate ?? '' }
];

export const SERVICE_AGREEMENT_BILLING_CSV_COLUMNS: CsvColumn<ServiceAgreementBillingDueReportRow>[] =
  [
    ...SERVICE_AGREEMENT_ACTIVE_CSV_COLUMNS,
    { header: 'Days until billing', value: (row) => row.daysUntilBilling }
  ];

export const SERVICE_AGREEMENT_VISIT_TEMPLATE_CSV_COLUMNS: CsvColumn<ServiceAgreementVisitTemplatePromptRow>[] =
  [
    { header: 'Agreement #', value: (row) => row.agreementNumber },
    { header: 'Customer', value: (row) => row.customerName },
    { header: 'Agreement', value: (row) => row.agreementName },
    { header: 'Template', value: (row) => row.title },
    { header: 'Frequency', value: (row) => row.frequency },
    { header: 'Projected due date', value: (row) => row.projectedDueDate ?? '' },
    { header: 'Days until projected due', value: (row) => row.daysUntilProjectedDue ?? '' },
    { header: 'Preferred month', value: (row) => row.preferredMonth ?? '' },
    { header: 'Preferred day', value: (row) => row.preferredDayOfMonth ?? '' },
    { header: 'Job type', value: (row) => row.jobType ?? '' },
    { header: 'Category', value: (row) => row.category ?? '' },
    { header: 'Covered locations', value: (row) => row.coveredLocationNames.join('; ') }
  ];

export async function buildServiceAgreementReports(
  databaseService: DatabaseService
): Promise<ServiceAgreementReports> {
  const [activeAgreements, expiringSoon, nextBillingDue, visitTemplatePrompts] = await Promise.all([
    queryActiveServiceAgreements(databaseService),
    queryExpiringSoonServiceAgreements(databaseService),
    queryNextBillingDueServiceAgreements(databaseService),
    queryVisitTemplatePrompts(databaseService)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    windows: {
      expiringSoonThrough: windowThroughDate(),
      nextBillingDueThrough: windowThroughDate(),
      visitTemplatePromptThrough: windowThroughDate()
    },
    totals: {
      activeAgreementCount: activeAgreements.length,
      expiringSoonCount: expiringSoon.length,
      nextBillingDueCount: nextBillingDue.length,
      visitTemplatePromptCount: visitTemplatePrompts.length
    },
    activeAgreements,
    expiringSoon,
    nextBillingDue,
    visitTemplatePrompts
  };
}

async function queryActiveServiceAgreements(
  databaseService: DatabaseService
): Promise<ServiceAgreementReportRow[]> {
  const result = await databaseService.query<AgreementReportRow>(
    `${baseAgreementReportSql('/* active_service_agreements_report */')}
     where agreement.status = 'active'
     group by agreement.id, customer.name
     order by agreement.renewal_date nulls last, agreement.agreement_number asc`,
    []
  );
  return result.rows.map(toAgreementReportRow);
}

async function queryExpiringSoonServiceAgreements(
  databaseService: DatabaseService
): Promise<ServiceAgreementReportRow[]> {
  const result = await databaseService.query<AgreementReportRow>(
    `${baseAgreementReportSql('/* expiring_service_agreements_report */')}
     where agreement.status = 'active'
       and coalesce(agreement.renewal_date, agreement.end_date) is not null
       and coalesce(agreement.renewal_date, agreement.end_date) <= current_date + ($1::int * interval '1 day')
     group by agreement.id, customer.name
     order by coalesce(agreement.renewal_date, agreement.end_date), agreement.agreement_number asc`,
    [promptWindowDays]
  );
  return result.rows.map(toAgreementReportRow);
}

async function queryNextBillingDueServiceAgreements(
  databaseService: DatabaseService
): Promise<ServiceAgreementBillingDueReportRow[]> {
  const result = await databaseService.query<BillingDueRow>(
    `${baseAgreementReportSql(
      '/* billing_due_service_agreements_report */',
      ', (agreement.next_billing_date - current_date) as "daysUntilBilling"'
    )}
     where agreement.status = 'active'
       and agreement.next_billing_date is not null
       and agreement.next_billing_date <= current_date + ($1::int * interval '1 day')
     group by agreement.id, customer.name
     order by agreement.next_billing_date, agreement.agreement_number asc`,
    [promptWindowDays]
  );
  return result.rows.map((row) => ({
    ...toAgreementReportRow(row),
    daysUntilBilling: Number(row.daysUntilBilling)
  }));
}

async function queryVisitTemplatePrompts(
  databaseService: DatabaseService
): Promise<ServiceAgreementVisitTemplatePromptRow[]> {
  const result = await databaseService.query<VisitTemplatePromptDbRow>(
    `
      select
        agreement.id as "agreementId",
        agreement.agreement_number as "agreementNumber",
        agreement.customer_id as "customerId",
        customer.name as "customerName",
        agreement.name as "agreementName",
        template.id as "templateId",
        template.title,
        template.frequency,
        template.preferred_month as "preferredMonth",
        template.preferred_day_of_month as "preferredDayOfMonth",
        null::date as "projectedDueDate",
        null::int as "daysUntilProjectedDue",
        template.time_window_label as "timeWindowLabel",
        template.job_type as "jobType",
        template.category,
        template.summary,
        template.estimated_duration_minutes as "estimatedDurationMinutes",
        array_agg(distinct covered_location.name order by covered_location.name)
          filter (where covered_location.name is not null) as "coveredLocationNames"
        /* visit_template_service_agreements_report */
      from service_agreements agreement
      inner join customers customer on customer.id = agreement.customer_id
      inner join service_agreement_visit_templates template
        on template.agreement_id = agreement.id
       and template.is_active = true
      left join service_agreement_covered_locations covered_agreement_location
        on covered_agreement_location.agreement_id = agreement.id
      left join locations covered_location
        on covered_location.id = covered_agreement_location.location_id
      where agreement.status = 'active'
      group by agreement.id, customer.name, template.id
      order by agreement.agreement_number, template.title
    `,
    []
  );
  return result.rows.map(toVisitTemplatePromptRow).filter((row) => {
    return row.daysUntilProjectedDue === undefined || row.daysUntilProjectedDue <= promptWindowDays;
  });
}

function baseAgreementReportSql(comment: string, extraSelect = ''): string {
  return `
    select
      agreement.id as "agreementId",
      agreement.agreement_number as "agreementNumber",
      agreement.customer_id as "customerId",
      customer.name as "customerName",
      agreement.name,
      agreement.status,
      agreement.start_date as "startDate",
      agreement.end_date as "endDate",
      agreement.renewal_date as "renewalDate",
      agreement.billing_cadence as "billingCadence",
      agreement.next_billing_date as "nextBillingDate",
      agreement.billing_amount as "billingAmount",
      array_agg(distinct covered_location.name order by covered_location.name)
        filter (where covered_location.name is not null) as "coveredLocationNames",
      count(distinct covered_equipment.equipment_id) as "coveredEquipmentCount",
      count(distinct visit_template.id)
        filter (where visit_template.is_active = true) as "activeVisitTemplateCount",
      agreement.updated_at as "updatedAt"
      ${extraSelect}
      ${comment}
    from service_agreements agreement
    inner join customers customer on customer.id = agreement.customer_id
    left join service_agreement_covered_locations covered_agreement_location
      on covered_agreement_location.agreement_id = agreement.id
    left join locations covered_location
      on covered_location.id = covered_agreement_location.location_id
    left join service_agreement_covered_equipment covered_equipment
      on covered_equipment.agreement_id = agreement.id
    left join service_agreement_visit_templates visit_template
      on visit_template.agreement_id = agreement.id
  `;
}

function toAgreementReportRow(row: AgreementReportRow): ServiceAgreementReportRow {
  return {
    agreementId: row.agreementId,
    agreementNumber: row.agreementNumber,
    customerId: row.customerId,
    customerName: row.customerName,
    name: row.name,
    status: row.status,
    startDate: toOptionalDateString(row.startDate),
    endDate: toOptionalDateString(row.endDate),
    renewalDate: toOptionalDateString(row.renewalDate),
    billingCadence: row.billingCadence,
    nextBillingDate: toOptionalDateString(row.nextBillingDate),
    billingAmount: row.billingAmount === null ? undefined : Number(row.billingAmount),
    coveredLocationNames: row.coveredLocationNames ?? [],
    coveredEquipmentCount: Number(row.coveredEquipmentCount),
    activeVisitTemplateCount: Number(row.activeVisitTemplateCount),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toVisitTemplatePromptRow(
  row: VisitTemplatePromptDbRow
): ServiceAgreementVisitTemplatePromptRow {
  const projectedDue = getProjectedDueDate(row.preferredMonth, row.preferredDayOfMonth);
  return {
    agreementId: row.agreementId,
    agreementNumber: row.agreementNumber,
    customerId: row.customerId,
    customerName: row.customerName,
    agreementName: row.agreementName,
    templateId: row.templateId,
    title: row.title,
    frequency: row.frequency,
    preferredMonth: row.preferredMonth ?? undefined,
    preferredDayOfMonth: row.preferredDayOfMonth ?? undefined,
    projectedDueDate: projectedDue?.date,
    daysUntilProjectedDue: projectedDue?.daysUntilDue,
    timeWindowLabel: row.timeWindowLabel ?? undefined,
    jobType: row.jobType ?? undefined,
    category: row.category ?? undefined,
    summary: row.summary ?? undefined,
    estimatedDurationMinutes: row.estimatedDurationMinutes ?? undefined,
    coveredLocationNames: row.coveredLocationNames ?? []
  };
}

function windowThroughDate(): string {
  const through = new Date();
  through.setUTCDate(through.getUTCDate() + promptWindowDays);
  return through.toISOString().slice(0, 10);
}

function getProjectedDueDate(
  preferredMonth: number | null,
  preferredDayOfMonth: number | null
): { date: string; daysUntilDue: number } | undefined {
  if (!preferredMonth) {
    return undefined;
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const currentYear = today.getUTCFullYear();
  const firstCandidate = buildDueDate(currentYear, preferredMonth, preferredDayOfMonth);
  const dueDate =
    firstCandidate.getTime() < todayUtc
      ? buildDueDate(currentYear + 1, preferredMonth, preferredDayOfMonth)
      : firstCandidate;
  const daysUntilDue = Math.round((dueDate.getTime() - todayUtc) / 86_400_000);
  return { date: dueDate.toISOString().slice(0, 10), daysUntilDue };
}

function buildDueDate(year: number, preferredMonth: number, preferredDayOfMonth: number | null) {
  const monthIndex = preferredMonth - 1;
  const lastDayOfMonth = new Date(Date.UTC(year, preferredMonth, 0)).getUTCDate();
  const day = Math.min(preferredDayOfMonth ?? 1, lastDayOfMonth);
  return new Date(Date.UTC(year, monthIndex, day));
}
