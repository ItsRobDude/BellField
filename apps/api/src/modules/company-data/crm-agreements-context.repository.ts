import type { CrmOperationalAgreementSummary, CrmOperationalSummary } from '@bellfield/contracts';
import { toIsoString, toOptionalDateString } from '../../database/database-row.utils';
import type { DatabaseService } from '../../database/database.service';

const crmAgreementLimit = 25;

type AgreementRow = {
  id: string;
  agreementNumber: string;
  customerId: string;
  customerName: string;
  name: string;
  status: CrmOperationalAgreementSummary['status'];
  startDate: string | Date | null;
  endDate: string | Date | null;
  renewalDate: string | Date | null;
  billingCadence: CrmOperationalAgreementSummary['billingCadence'];
  nextBillingDate: string | Date | null;
  billingAmount: string | number | null;
  coveredLocationNames: string[] | null;
  coveredEquipmentCount: string | number;
  activeVisitTemplateCount: string | number;
  updatedAt: string | Date;
};

type AgreementCountsRow = {
  activeAgreementCount: string | number;
  endedAgreementCount: string | number;
};

export async function listCrmAgreementsForLocation(
  databaseService: DatabaseService,
  locationId: string
): Promise<CrmOperationalAgreementSummary[]> {
  const result = await databaseService.query<AgreementRow>(
    getAgreementsSelectSql(
      `
        inner join service_agreement_covered_locations scoped_acl
          on scoped_acl.agreement_id = agreement.id
         and scoped_acl.location_id = $1
      `,
      ''
    ),
    [locationId, crmAgreementLimit]
  );

  return result.rows.map(toAgreementSummary);
}

export async function listCrmAgreementsForCustomer(
  databaseService: DatabaseService,
  customerId: string
): Promise<CrmOperationalAgreementSummary[]> {
  const result = await databaseService.query<AgreementRow>(
    getAgreementsSelectSql('', 'and agreement.customer_id = $1'),
    [customerId, crmAgreementLimit]
  );

  return result.rows.map(toAgreementSummary);
}

export async function getCrmAgreementCountsForLocation(
  databaseService: DatabaseService,
  locationId: string
): Promise<Pick<CrmOperationalSummary, 'activeAgreementCount' | 'endedAgreementCount'>> {
  const result = await databaseService.query<AgreementCountsRow>(
    `
      select
        count(*) filter (where agreement.status = 'active') as "activeAgreementCount",
        count(*) filter (where agreement.status = 'ended') as "endedAgreementCount"
      from service_agreements agreement
      inner join service_agreement_covered_locations covered_location
        on covered_location.agreement_id = agreement.id
       and covered_location.location_id = $1
      where agreement.status in ('active', 'ended')
    `,
    [locationId]
  );

  return toAgreementCounts(result.rows[0]);
}

export async function getCrmAgreementCountsForCustomer(
  databaseService: DatabaseService,
  customerId: string
): Promise<Pick<CrmOperationalSummary, 'activeAgreementCount' | 'endedAgreementCount'>> {
  const result = await databaseService.query<AgreementCountsRow>(
    `
      select
        count(*) filter (where agreement.status = 'active') as "activeAgreementCount",
        count(*) filter (where agreement.status = 'ended') as "endedAgreementCount"
      from service_agreements agreement
      where agreement.customer_id = $1
        and agreement.status in ('active', 'ended')
    `,
    [customerId]
  );

  return toAgreementCounts(result.rows[0]);
}

function getAgreementsSelectSql(scopeJoinSql: string, scopeWhereSql: string): string {
  return `
    select
      agreement.id,
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
    from service_agreements agreement
    inner join customers customer on customer.id = agreement.customer_id
    ${scopeJoinSql}
    left join service_agreement_covered_locations covered_agreement_location
      on covered_agreement_location.agreement_id = agreement.id
    left join locations covered_location
      on covered_location.id = covered_agreement_location.location_id
    left join service_agreement_covered_equipment covered_equipment
      on covered_equipment.agreement_id = agreement.id
    left join service_agreement_visit_templates visit_template
      on visit_template.agreement_id = agreement.id
    where agreement.status in ('active', 'ended')
      ${scopeWhereSql}
    group by agreement.id, customer.name
    order by
      case agreement.status when 'active' then 0 else 1 end,
      agreement.renewal_date nulls last,
      agreement.updated_at desc
    limit $2
  `;
}

function toAgreementSummary(row: AgreementRow): CrmOperationalAgreementSummary {
  return {
    id: row.id,
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

function toAgreementCounts(
  row: AgreementCountsRow | undefined
): Pick<CrmOperationalSummary, 'activeAgreementCount' | 'endedAgreementCount'> {
  return {
    activeAgreementCount: Number(row?.activeAgreementCount ?? 0),
    endedAgreementCount: Number(row?.endedAgreementCount ?? 0)
  };
}
