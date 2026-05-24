import pg from 'pg';

const { Client } = pg;

const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/bellfield';
const databaseUrl = process.env.DATABASE_URL?.trim() || defaultDatabaseUrl;
const allowNonLocal = process.argv.includes('--allow-nonlocal');

function formatLocalDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function addDays(value, days) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function assertLocalDatabaseUrl(value) {
  if (allowNonLocal) {
    return;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    console.error('Refusing to prepare smoke data because DATABASE_URL is not a valid URL.');
    process.exit(1);
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(parsed.hostname)) {
    console.error(
      `Refusing to prepare smoke data for non-local database host "${parsed.hostname}".`
    );
    console.error('Pass --allow-nonlocal only for an intentional disposable test database.');
    process.exit(1);
  }
}

async function updateAppointment(client, appointment) {
  const result = await client.query(
    `
      update appointments
      set
        scheduled_date = $2,
        scheduled_start_time = $3,
        scheduled_end_time = $4,
        time_window_label = $5,
        technician_id = $6,
        status = $7,
        finish_outcome = null,
        visit_notes = null,
        has_charge_activity = null,
        register_follow_up_note = null,
        finished_reviewed_at = null,
        finished_reviewed_by = null,
        finished_review_decision = null,
        updated_at = $8
      where id = $1
    `,
    [
      appointment.id,
      appointment.scheduledDate,
      appointment.scheduledStartTime,
      appointment.scheduledEndTime,
      appointment.timeWindowLabel,
      appointment.technicianId,
      appointment.status,
      appointment.updatedAt
    ]
  );

  return result.rowCount ?? 0;
}

async function main() {
  assertLocalDatabaseUrl(databaseUrl);

  const now = new Date();
  const today = formatLocalDate(now);
  const tomorrow = formatLocalDate(addDays(now, 1));
  const updatedAt = now.toISOString();
  const technicianId = 'employee-technician-1';
  const appointments = [
    {
      id: 'appointment-1001-a',
      scheduledDate: today,
      scheduledStartTime: '13:00',
      scheduledEndTime: '15:00',
      timeWindowLabel: '1:00 PM - 3:00 PM',
      technicianId,
      status: 'scheduled',
      updatedAt
    },
    {
      id: 'appointment-1002-a',
      scheduledDate: today,
      scheduledStartTime: '08:00',
      scheduledEndTime: '10:00',
      timeWindowLabel: '8:00 AM - 10:00 AM',
      technicianId,
      status: 'working',
      updatedAt
    },
    {
      id: 'appointment-1002-b',
      scheduledDate: tomorrow,
      scheduledStartTime: '09:00',
      scheduledEndTime: '11:00',
      timeWindowLabel: '9:00 AM - 11:00 AM',
      technicianId,
      status: 'scheduled',
      updatedAt
    }
  ];

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('begin');

    const employeeResult = await client.query(
      `
        update employees
        set is_active = true, updated_at = $2
        where id = $1
      `,
      [technicianId, updatedAt]
    );

    const appointmentRowCounts = [];
    for (const appointment of appointments) {
      appointmentRowCounts.push([appointment.id, await updateAppointment(client, appointment)]);
    }

    await client.query(
      `
        update jobs
        set
          status = case
            when id = 'job-service-1002' then 'inProgress'
            else 'scheduled'
          end,
          updated_at = $2
        where id = any($1::text[])
      `,
      [['job-service-1001', 'job-service-1002'], updatedAt]
    );

    const missing = [
      ...(employeeResult.rowCount === 0 ? [technicianId] : []),
      ...appointmentRowCounts.filter(([, count]) => count === 0).map(([id]) => id)
    ];

    if (missing.length > 0) {
      throw new Error(
        [
          `Unable to prepare field smoke data. Missing seed rows: ${missing.join(', ')}`,
          'Run pnpm dev:migrate and start the API once with seed data enabled, then retry.'
        ].join('\n')
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }

  console.log('Prepared local field smoke data.');
  console.log(`Technician: ${technicianId}`);
  console.log(`Today: ${today}`);
  console.log(`Tomorrow: ${tomorrow}`);
  for (const appointment of appointments) {
    console.log(
      `- ${appointment.id}: ${appointment.scheduledDate} ${appointment.scheduledStartTime}-${appointment.scheduledEndTime} (${appointment.status})`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
