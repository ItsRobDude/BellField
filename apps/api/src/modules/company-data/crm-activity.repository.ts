import type { CrmActivityEntry, CrmActivityEntryKind } from '@bellfield/contracts';
import { toIsoString } from '../../database/database-row.utils';
import type { DatabaseService } from '../../database/database.service';

type ActivityRow = {
  id: string;
  kind: CrmActivityEntryKind;
  occurredAt: string | Date;
  title: string;
  detail: string | null;
  jobId: string | null;
  jobNumber: string | null;
  locationId: string | null;
  locationName: string | null;
  actorName: string | null;
};

export async function listCrmActivityForLocation(
  databaseService: DatabaseService,
  locationId: string,
  limit: number
): Promise<CrmActivityEntry[]> {
  const result = await databaseService.query<ActivityRow>(
    `
      with scoped_jobs as (
        select job.id, job.job_number, job.location_id, location.name as location_name
        from jobs job
        inner join locations location on location.id = job.location_id
        where job.location_id = $1
      )
      ${getActivityUnionSql(
        `
          where ownership.location_id = $1
        `,
        `
          where equipment.location_id = $1
        `,
        `
          select
            link.id,
            'contact'::text as kind,
            link.updated_at as "occurredAt",
            concat(
              case when link.is_active then 'Contact linked: ' else 'Contact archived: ' end,
              contact.display_name
            ) as title,
            nullif(
              concat_ws(
                ' · ',
                nullif(array_to_string(link.tags, ', '), ''),
                coalesce(link.phone_override, contact.phone),
                coalesce(link.email_override, contact.email)
              ),
              ''
            ) as detail,
            null::text as "jobId",
            null::text as "jobNumber",
            link.location_id as "locationId",
            location.name as "locationName",
            null::text as "actorName"
          from location_contact_links link
          inner join contacts contact on contact.id = link.contact_id
          inner join locations location on location.id = link.location_id
          where link.location_id = $1
        `
      )}
    `,
    [locationId, limit]
  );

  return result.rows.map(toActivityEntry);
}

export async function listCrmActivityForCustomer(
  databaseService: DatabaseService,
  customerId: string,
  limit: number
): Promise<CrmActivityEntry[]> {
  const result = await databaseService.query<ActivityRow>(
    `
      with scoped_jobs as (
        select job.id, job.job_number, job.location_id, location.name as location_name
        from jobs job
        inner join locations location on location.id = job.location_id
        where location.customer_id = $1
           or job.bill_to_customer_id = $1
      )
      ${getActivityUnionSql(
        `
          where ownership.customer_id = $1
        `,
        `
          inner join locations location on location.id = equipment.location_id
          where location.customer_id = $1
        `,
        `
          select
            link.id,
            'contact'::text as kind,
            link.updated_at as "occurredAt",
            concat(
              case when link.is_active then 'Contact linked: ' else 'Contact archived: ' end,
              contact.display_name
            ) as title,
            nullif(
              concat_ws(
                ' · ',
                nullif(array_to_string(link.tags, ', '), ''),
                coalesce(link.phone_override, contact.phone),
                coalesce(link.email_override, contact.email)
              ),
              ''
            ) as detail,
            null::text as "jobId",
            null::text as "jobNumber",
            null::text as "locationId",
            null::text as "locationName",
            null::text as "actorName"
          from customer_contact_links link
          inner join contacts contact on contact.id = link.contact_id
          where link.customer_id = $1
        `
      )}
    `,
    [customerId, limit]
  );

  return result.rows.map(toActivityEntry);
}

function getActivityUnionSql(
  ownershipWhereClause: string,
  equipmentScopeSql: string,
  contactActivitySql: string
): string {
  return `
    select *
    from (
      select
        ownership.id,
        'ownership'::text as kind,
        ownership.started_at as "occurredAt",
        concat('Owner: ', customer.name) as title,
        ownership.note as detail,
        null::text as "jobId",
        null::text as "jobNumber",
        ownership.location_id as "locationId",
        location.name as "locationName",
        null::text as "actorName"
      from location_ownership_history ownership
      inner join customers customer on customer.id = ownership.customer_id
      inner join locations location on location.id = ownership.location_id
      ${ownershipWhereClause}

      union all

      select
        timeline.id,
        case
          when timeline.kind like 'appointment%' then 'appointment'
          else 'job'
        end as kind,
        timeline.occurred_at as "occurredAt",
        timeline.message as title,
        concat('Job ', scoped_jobs.job_number) as detail,
        timeline.job_id as "jobId",
        scoped_jobs.job_number as "jobNumber",
        scoped_jobs.location_id as "locationId",
        scoped_jobs.location_name as "locationName",
        timeline.actor_name as "actorName"
      from job_timeline_entries timeline
      inner join scoped_jobs on scoped_jobs.id = timeline.job_id

      union all

      select
        history.id,
        'equipment'::text as kind,
        history.occurred_at as "occurredAt",
        history.message as title,
        concat(equipment.equipment_type, ' ', equipment.brand, ' ', equipment.model) as detail,
        null::text as "jobId",
        null::text as "jobNumber",
        equipment.location_id as "locationId",
        location_for_equipment.name as "locationName",
        history.actor_name as "actorName"
      from equipment_history_entries history
      inner join equipment equipment on equipment.id = history.equipment_id
      left join locations location_for_equipment on location_for_equipment.id = equipment.location_id
      ${equipmentScopeSql}

      union all

      ${contactActivitySql}
    ) activity
    order by activity."occurredAt" desc
    limit $2
  `;
}

function toActivityEntry(row: ActivityRow): CrmActivityEntry {
  return {
    id: row.id,
    kind: row.kind,
    occurredAt: toIsoString(row.occurredAt),
    title: row.title,
    detail: row.detail ?? undefined,
    jobId: row.jobId ?? undefined,
    jobNumber: row.jobNumber ?? undefined,
    locationId: row.locationId ?? undefined,
    locationName: row.locationName ?? undefined,
    actorName: row.actorName ?? undefined
  };
}
