import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Focused jobs/appointments lifecycle smoke. Proves the paths a unit test cannot honestly
// prove through the real API + database, with emphasis on the write paths touched by the
// jobs-data repository split (slice 3) and the standalone createAppointment transaction
// hardening:
//
//   - create a job WITH an initial appointment (job opens as scheduled)
//   - create a job WITHOUT an appointment (opens as new), then add an appointment
//   - complete a job (freezes the finalized cost snapshot), then reopen it (supersedes it)
//   - read job detail and technician assigned-work after those writes

const timestamp = new Date().toISOString();
const runId = timestamp.replace(/[:.]/g, '-');
const tag = `jobs-smoke-${runId}`;
const apiBaseUrl = normalizeBaseUrl(
  getArgValue('--api-base-url') || process.env.BELLFIELD_API_BASE_URL || 'http://localhost:3001'
);
const allowNonLocal = process.argv.includes('--allow-non-local');
const evidenceDir =
  getArgValue('--evidence-dir') ||
  process.env.BELLFIELD_SMOKE_ARTIFACT_DIR ||
  path.join('artifacts', 'validation', runId);
const evidencePath = path.join(evidenceDir, 'jobs-lifecycle-api-smoke.json');

const locationId = process.env.BELLFIELD_SMOKE_LOCATION_ID || 'location-parkers-home';
const technicianId = process.env.BELLFIELD_SMOKE_TECHNICIAN_ID || 'employee-technician-1';

const evidence = {
  name: 'Jobs/appointments lifecycle API smoke',
  startedAt: timestamp,
  apiBaseUrl,
  tag,
  steps: [],
  checks: [],
  created: {}
};

let sessionToken = '';

try {
  assertLocalTarget(apiBaseUrl);
  await request('GET', '/health', undefined, [200], { auth: false });

  const login = await request(
    'POST',
    '/identity/auth/login',
    {
      email: process.env.BELLFIELD_SMOKE_EMAIL || 'admin@bellfield.local',
      password: process.env.BELLFIELD_SMOKE_PASSWORD || 'bellfield-admin',
      surface: 'office-web',
      deviceLabel: `Jobs smoke ${runId}`
    },
    [200, 201],
    { auth: false }
  );
  sessionToken = login.sessionToken;
  evidence.created.sessionEmployee = login.employee?.email;

  // 1. Create a job WITH an initial appointment. The repository derives 'scheduled'.
  const scheduledDate = isoDateInDays(3);
  const scheduledJob = await request('POST', '/operations/jobs', {
    locationId,
    jobType: 'Lifecycle smoke (scheduled)',
    category: 'Validation',
    origin: 'Local smoke script',
    summary: `${tag} scheduled-on-create`,
    workOrderNumber: `${tag}-A`,
    scheduledDate,
    scheduledStartTime: '09:00',
    scheduledEndTime: '11:00',
    technicianId
  });
  evidence.created.scheduledJobId = scheduledJob.id;
  check(
    'job created with an initial appointment opens as scheduled',
    scheduledJob.status === 'scheduled',
    { id: scheduledJob.id, status: scheduledJob.status }
  );

  const scheduledDetail = await request(
    'GET',
    `/operations/jobs/${scheduledJob.id}/detail?timelineLimit=20`
  );
  check(
    'scheduled job detail returns its first appointment',
    Array.isArray(scheduledDetail.job?.appointments) &&
      scheduledDetail.job.appointments.length === 1,
    {
      appointmentCount: scheduledDetail.job?.appointments?.length,
      timelineKinds: scheduledDetail.job?.timeline?.map((entry) => entry.kind)
    }
  );

  // 2. Create a job WITHOUT an appointment (opens 'new'), then add one via the standalone
  //    createAppointment path (the path that now opens its own transaction).
  const unscheduledJob = await request('POST', '/operations/jobs', {
    locationId,
    jobType: 'Lifecycle smoke (unscheduled)',
    category: 'Validation',
    origin: 'Local smoke script',
    summary: `${tag} unscheduled-on-create`,
    workOrderNumber: `${tag}-B`
  });
  evidence.created.unscheduledJobId = unscheduledJob.id;
  check('job created without an appointment opens as new', unscheduledJob.status === 'new', {
    id: unscheduledJob.id,
    status: unscheduledJob.status
  });

  // POST .../appointments returns the updated JobSummary (not the appointment), so the new
  // appointment is read out of the returned job's appointments array — and that promotion to
  // 'scheduled' with exactly one appointment is itself the proof the add landed.
  const jobAfterAddingAppointment = await request(
    'POST',
    `/operations/jobs/${unscheduledJob.id}/appointments`,
    {
      scheduledDate: isoDateInDays(5),
      scheduledStartTime: '13:00',
      scheduledEndTime: '15:00',
      technicianId
    }
  );
  const addedAppointment = jobAfterAddingAppointment.appointments?.[0];
  evidence.created.addedAppointmentId = addedAppointment?.id;
  check(
    'appointment added to a previously unscheduled job (returned on the job summary)',
    jobAfterAddingAppointment.status === 'scheduled' &&
      jobAfterAddingAppointment.appointments?.length === 1 &&
      Boolean(addedAppointment?.id),
    {
      jobId: jobAfterAddingAppointment.id,
      jobStatus: jobAfterAddingAppointment.status,
      appointmentId: addedAppointment?.id,
      appointmentStatus: addedAppointment?.status
    }
  );

  const afterAddDetail = await request(
    'GET',
    `/operations/jobs/${unscheduledJob.id}/detail?timelineLimit=20`
  );
  check(
    'adding an appointment promotes the job to scheduled and records timeline history',
    afterAddDetail.job?.status === 'scheduled' &&
      afterAddDetail.job?.appointments?.length === 1 &&
      afterAddDetail.job?.timeline?.some((entry) => entry.kind === 'appointmentCreated'),
    {
      status: afterAddDetail.job?.status,
      appointmentCount: afterAddDetail.job?.appointments?.length,
      timelineKinds: afterAddDetail.job?.timeline?.map((entry) => entry.kind)
    }
  );

  // 3. Complete the scheduled job (freezes the finalized cost snapshot in the same
  //    transaction as the status change), then reopen it (supersedes the snapshot).
  const completed = await request('PATCH', `/operations/jobs/${scheduledJob.id}/status`, {
    status: 'completed'
  });
  check('scheduled job completes', completed.status === 'completed', { status: completed.status });

  const finalizedCosting = await request('GET', `/operations/jobs/${scheduledJob.id}/costing`);
  check(
    'completion freezes a finalized cost snapshot',
    finalizedCosting.costing?.isFinalized === true,
    { isFinalized: finalizedCosting.costing?.isFinalized }
  );

  const reopened = await request('PATCH', `/operations/jobs/${scheduledJob.id}/status`, {
    status: 'inProgress'
  });
  check('completed job reopens to inProgress', reopened.status === 'inProgress', {
    status: reopened.status
  });

  const reopenedCosting = await request('GET', `/operations/jobs/${scheduledJob.id}/costing`);
  check(
    'reopening supersedes the finalized snapshot (live cost again)',
    reopenedCosting.costing?.isFinalized === false,
    { isFinalized: reopenedCosting.costing?.isFinalized }
  );

  // 4. Technician assigned-work read after those writes. The assigned-work window is only
  //    today/tomorrow (local) and is scoped to the signed-in field employee, so create a job
  //    scheduled for local today assigned to the seeded technician, then read it back as that
  //    technician — exercising listAssignedJobsForEmployee -> listJobsByIds -> hydrateJobs.
  const todayLocal = localDateToday();
  const assignedJob = await request('POST', '/operations/jobs', {
    locationId,
    jobType: 'Lifecycle smoke (assigned today)',
    category: 'Validation',
    origin: 'Local smoke script',
    summary: `${tag} assigned-today`,
    workOrderNumber: `${tag}-C`,
    scheduledDate: todayLocal,
    scheduledStartTime: '10:00',
    scheduledEndTime: '12:00',
    technicianId
  });
  evidence.created.assignedJobId = assignedJob.id;
  check(
    'job scheduled for the technician today opens as scheduled',
    assignedJob.status === 'scheduled',
    {
      id: assignedJob.id,
      status: assignedJob.status,
      scheduledDate: todayLocal
    }
  );

  const technicianLogin = await request(
    'POST',
    '/identity/auth/login',
    {
      email: process.env.BELLFIELD_SMOKE_TECH_EMAIL || 'tech@bellfield.local',
      password: process.env.BELLFIELD_SMOKE_TECH_PASSWORD || 'bellfield-tech',
      surface: 'field-mobile',
      deviceLabel: `Jobs smoke tech ${runId}`
    },
    [200, 201],
    { auth: false }
  );
  sessionToken = technicianLogin.sessionToken;
  evidence.created.technicianEmployee = technicianLogin.employee?.email;

  const assigned = await request('GET', '/operations/jobs/field/assigned-work');
  const assignedJobs = assigned.jobs || [];
  check(
    "assigned-work read returns the technician's job scheduled for today",
    assignedJobs.some((entry) => entry.id === assignedJob.id),
    { date: todayLocal, jobIds: assignedJobs.map((entry) => entry.id) }
  );

  evidence.completedAt = new Date().toISOString();
  evidence.status = 'passed';
  await writeEvidence();
  console.log(`Jobs lifecycle API smoke passed. Evidence: ${evidencePath}`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.status = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  await writeEvidence();
  console.error(`Jobs lifecycle API smoke failed. Evidence: ${evidencePath}`);
  console.error(evidence.error);
  process.exit(1);
}

async function request(method, route, body, expectedStatuses = [200, 201], options = {}) {
  const url = new URL(route, `${apiBaseUrl}/`);
  const headers = {};
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.auth !== false) {
    headers.authorization = `Bearer ${sessionToken}`;
  }

  let response;
  let parsed;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    parsed = await parseResponse(response);
  } catch (error) {
    evidence.steps.push({
      name: `${method} ${route}`,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  evidence.steps.push({
    name: `${method} ${route}`,
    status: expectedStatuses.includes(response.status) ? 'passed' : 'failed',
    httpStatus: response.status
  });

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${method} ${route} expected ${expectedStatuses.join('/')} but got ${response.status}: ${JSON.stringify(parsed)}`
    );
  }

  return parsed;
}

function check(name, condition, details) {
  evidence.checks.push({
    name,
    status: condition ? 'passed' : 'failed',
    details
  });
  if (!condition) {
    throw new Error(`Smoke check failed: ${name} -> ${JSON.stringify(details)}`);
  }
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function writeEvidence() {
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

function isoDateInDays(days) {
  const base = new Date(timestamp);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

// Local (server-timezone) date, matching how the assigned-work window is computed.
function localDateToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function assertLocalTarget(value) {
  const url = new URL(value);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!localHosts.has(url.hostname) && !allowNonLocal) {
    throw new Error(
      `Refusing to run a mutating smoke test against non-local API target ${value}. Pass --allow-non-local only for an intentionally disposable environment.`
    );
  }
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}
