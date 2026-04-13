'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  addOfficeAppointment,
  createOfficeEquipment,
  createOfficeJob,
  getOfficeEquipmentWorkspace,
  getOfficeJobsWorkspace,
  updateOfficeAppointmentStatus,
  updateOfficeEquipment,
  updateOfficeJobStatus,
  type AppointmentStatus,
  type EquipmentStatus,
  type EquipmentSummary,
  type JobsWorkspaceResponse
} from '@/lib/operations-api';
import {
  getCurrentOfficeSession,
  getOfficeEmployees,
  getOfficeRoles,
  updateOfficeEmployee,
  type EmployeeRoleId,
  type EmployeeSummary,
  type RoleTemplate
} from '@/lib/identity-api';

const plannedOfficeAreas = ['Accounts', 'Locations', 'Jobs', 'Dispatch', 'Invoices', 'Reports'];

type Props = {
  apiBaseUrl: string;
  initialEmployee: EmployeeSummary;
  sessionToken: string;
  onSignOut: () => void;
};

type AppointmentDraft = {
  scheduledDate: string;
  timeWindowLabel: string;
  technicianId: string;
};

function canViewEmployees(employee: EmployeeSummary | null): boolean {
  return employee?.effectivePermissions.includes('employeesPermissions:view') ?? false;
}

export function OfficeWorkspaceShell({ apiBaseUrl, initialEmployee, sessionToken, onSignOut }: Props) {
  const [employee, setEmployee] = useState(initialEmployee);
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [jobsWorkspace, setJobsWorkspace] = useState<JobsWorkspaceResponse | null>(null);
  const [equipment, setEquipment] = useState<EquipmentSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showInactiveEquipment, setShowInactiveEquipment] = useState(false);
  const [equipmentModel, setEquipmentModel] = useState('');
  const [equipmentSerial, setEquipmentSerial] = useState('');
  const [equipmentLocationId, setEquipmentLocationId] = useState('');
  const [equipmentStatus, setEquipmentStatus] = useState<EquipmentStatus>('active');
  const [jobLocationId, setJobLocationId] = useState('');
  const [jobBillToCustomerId, setJobBillToCustomerId] = useState('');
  const [jobSummary, setJobSummary] = useState('');
  const [jobTechnicianId, setJobTechnicianId] = useState('');
  const [jobDate, setJobDate] = useState('');
  const [jobWindow, setJobWindow] = useState('');
  const [appointmentDrafts, setAppointmentDrafts] = useState<Record<string, AppointmentDraft>>({});

  const locationLookup = useMemo(
    () => new Map((jobsWorkspace?.locations ?? []).map((location) => [location.id, location])),
    [jobsWorkspace]
  );

  useEffect(() => {
    void refreshWorkspace();
  }, [showInactiveEquipment]);

  async function refreshWorkspace() {
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const currentSession = await getCurrentOfficeSession({ sessionToken, apiBaseUrl });
      const roleResponse = await getOfficeRoles({ sessionToken, apiBaseUrl });
      const nextJobsWorkspace = await getOfficeJobsWorkspace({ sessionToken, apiBaseUrl });
      const nextEquipmentWorkspace = await getOfficeEquipmentWorkspace({
        sessionToken,
        apiBaseUrl,
        includeInactive: showInactiveEquipment
      });

      setEmployee(currentSession.employee);
      setRoles(roleResponse.roles);
      setJobsWorkspace(nextJobsWorkspace);
      setEquipment(nextEquipmentWorkspace.equipment);

      if (!jobLocationId && nextJobsWorkspace.locations[0]) {
        setJobLocationId(nextJobsWorkspace.locations[0].id);
        setJobBillToCustomerId(nextJobsWorkspace.locations[0].customerId);
      }

      if (!equipmentLocationId && nextJobsWorkspace.locations[0]) {
        setEquipmentLocationId(nextJobsWorkspace.locations[0].id);
      }

      if (canViewEmployees(currentSession.employee)) {
        const employeeResponse = await getOfficeEmployees({ sessionToken, apiBaseUrl });
        setEmployees(employeeResponse.employees);
      } else {
        setEmployees([]);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh the office workspace.');
      onSignOut();
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleEmployeeUpdate(employeeId: string, roleId: EmployeeRoleId, isActive: boolean) {
    try {
      await updateOfficeEmployee({ employeeId, roleId, isActive, sessionToken, apiBaseUrl });
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update employee.');
    }
  }

  async function handleCreateEquipment() {
    try {
      await createOfficeEquipment({
        sessionToken,
        apiBaseUrl,
        locationId: equipmentLocationId || undefined,
        equipmentType: 'Equipment',
        brand: 'Generic',
        model: equipmentModel,
        serialNumber: equipmentSerial,
        filterSizes: ['16x25x1'],
        status: equipmentStatus
      });
      setEquipmentModel('');
      setEquipmentSerial('');
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add equipment.');
    }
  }

  async function handleEquipmentStatusChange(record: EquipmentSummary, nextStatus: EquipmentStatus) {
    try {
      await updateOfficeEquipment({
        equipmentId: record.id,
        sessionToken,
        apiBaseUrl,
        status: nextStatus,
        notes: record.notes
      });
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update equipment.');
    }
  }

  async function handleCreateJob() {
    try {
      await createOfficeJob({
        sessionToken,
        apiBaseUrl,
        locationId: jobLocationId,
        billToCustomerId: jobBillToCustomerId || undefined,
        jobType: 'Service',
        category: 'General',
        origin: 'Office created',
        summary: jobSummary,
        scheduledDate: jobDate || undefined,
        timeWindowLabel: jobWindow || undefined,
        technicianId: jobTechnicianId || undefined
      });
      setJobSummary('');
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create job.');
    }
  }

  async function handleJobStatusChange(jobId: string, status: 'open' | 'closed' | 'posted' | 'cancelled') {
    try {
      await updateOfficeJobStatus({ jobId, status, sessionToken, apiBaseUrl });
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update job status.');
    }
  }

  async function handleAppointmentStatusChange(appointmentId: string, status: AppointmentStatus) {
    try {
      await updateOfficeAppointmentStatus({ appointmentId, status, sessionToken, apiBaseUrl });
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update appointment status.');
    }
  }

  async function handleAddAppointment(jobId: string) {
    const draft = appointmentDrafts[jobId] ?? { scheduledDate: '', timeWindowLabel: '', technicianId: '' };

    try {
      await addOfficeAppointment({
        jobId,
        sessionToken,
        apiBaseUrl,
        scheduledDate: draft.scheduledDate || undefined,
        timeWindowLabel: draft.timeWindowLabel || undefined,
        technicianId: draft.technicianId || undefined
      });
      setAppointmentDrafts((current) => ({
        ...current,
        [jobId]: { scheduledDate: '', timeWindowLabel: '', technicianId: '' }
      }));
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add appointment.');
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.row}>
          <div>
            <div style={styles.kicker}>BellField Office</div>
            <h1 style={styles.title}>{employee.displayName}</h1>
            <p style={styles.muted}>
              This shell now exercises employee access, equipment records, and job/appointment foundations from one
              API-backed workspace.
            </p>
          </div>
          <div style={styles.row}>
            <button type="button" onClick={() => void refreshWorkspace()} style={styles.button}>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" onClick={onSignOut} style={styles.button}>
              Sign out
            </button>
          </div>
        </div>
        <p style={styles.muted}>
          {employee.email} - permissions {employee.effectivePermissions.length} - planned areas: {plannedOfficeAreas.join(', ')}
        </p>
        {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      </section>

      {canViewEmployees(employee) ? (
        <section style={styles.card}>
          <h2 style={styles.heading}>Employees</h2>
          <div style={styles.grid}>
            {employees.map((managedEmployee) => (
              <article key={managedEmployee.id} style={styles.panel}>
                <strong>{managedEmployee.displayName}</strong>
                <div style={styles.muted}>{managedEmployee.email}</div>
                <select
                  value={managedEmployee.roleId}
                  onChange={(event) =>
                    void handleEmployeeUpdate(
                      managedEmployee.id,
                      event.target.value as EmployeeRoleId,
                      managedEmployee.isActive
                    )
                  }
                  style={styles.input}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <label style={styles.inlineLabel}>
                  <input
                    type="checkbox"
                    checked={managedEmployee.isActive}
                    onChange={(event) =>
                      void handleEmployeeUpdate(managedEmployee.id, managedEmployee.roleId, event.target.checked)
                    }
                  />
                  Active
                </label>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section style={styles.card}>
        <div style={styles.row}>
          <h2 style={styles.heading}>Equipment</h2>
          <label style={styles.inlineLabel}>
            <input
              type="checkbox"
              checked={showInactiveEquipment}
              onChange={(event) => setShowInactiveEquipment(event.target.checked)}
            />
            Show inactive
          </label>
        </div>
        <div style={styles.formRow}>
          <select value={equipmentLocationId} onChange={(event) => setEquipmentLocationId(event.target.value)} style={styles.input}>
            {(jobsWorkspace?.locations ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <input value={equipmentModel} onChange={(event) => setEquipmentModel(event.target.value)} placeholder="Model" style={styles.input} />
          <input value={equipmentSerial} onChange={(event) => setEquipmentSerial(event.target.value)} placeholder="Serial" style={styles.input} />
          <select value={equipmentStatus} onChange={(event) => setEquipmentStatus(event.target.value as EquipmentStatus)} style={styles.input}>
            <option value="active">Active</option>
            <option value="pendingInstall">Pending install</option>
            <option value="inactive">Inactive</option>
          </select>
          <button type="button" onClick={() => void handleCreateEquipment()} style={styles.button}>
            Add equipment
          </button>
        </div>
        <div style={styles.grid}>
          {equipment.map((record) => (
            <article key={record.id} style={styles.panel}>
              <strong>
                {record.brand} {record.model}
              </strong>
              <div style={styles.muted}>{record.locationName || record.inventoryLocationLabel}</div>
              <div style={styles.muted}>Serial: {record.serialNumber}</div>
              <select
                value={record.status}
                onChange={(event) => void handleEquipmentStatusChange(record, event.target.value as EquipmentStatus)}
                style={styles.input}
              >
                <option value="active">Active</option>
                <option value="pendingInstall">Pending install</option>
                <option value="inactive">Inactive</option>
              </select>
            </article>
          ))}
        </div>
      </section>

      <section style={styles.card}>
        <h2 style={styles.heading}>Jobs and appointments</h2>
        <div style={styles.formRow}>
          <select
            value={jobLocationId}
            onChange={(event) => {
              const nextLocation = locationLookup.get(event.target.value);
              setJobLocationId(event.target.value);
              setJobBillToCustomerId(nextLocation?.customerId ?? '');
            }}
            style={styles.input}
          >
            {(jobsWorkspace?.locations ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <select value={jobBillToCustomerId} onChange={(event) => setJobBillToCustomerId(event.target.value)} style={styles.input}>
            {(() => {
              const selectedLocation = jobLocationId ? locationLookup.get(jobLocationId) : null;
              if (!selectedLocation) {
                return null;
              }

              return [selectedLocation.customerId, ...selectedLocation.alternateBillToCustomerIds].map((customerId) => {
                const customer = jobsWorkspace?.customers.find((candidate) => candidate.id === customerId);
                return customer ? (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ) : null;
              });
            })()}
          </select>
          <input value={jobSummary} onChange={(event) => setJobSummary(event.target.value)} placeholder="Job summary" style={styles.input} />
          <input value={jobDate} onChange={(event) => setJobDate(event.target.value)} type="date" style={styles.input} />
          <input value={jobWindow} onChange={(event) => setJobWindow(event.target.value)} placeholder="1:00 PM - 3:00 PM" style={styles.input} />
          <select value={jobTechnicianId} onChange={(event) => setJobTechnicianId(event.target.value)} style={styles.input}>
            <option value="">Unassigned</option>
            {(jobsWorkspace?.technicians ?? []).map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.displayName}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void handleCreateJob()} style={styles.button}>
            Create job
          </button>
        </div>
        <div style={styles.list}>
          {(jobsWorkspace?.jobs ?? []).map((job) => {
            const draft = appointmentDrafts[job.id] ?? { scheduledDate: '', timeWindowLabel: '', technicianId: '' };

            return (
              <article key={job.id} style={styles.panel}>
                <div style={styles.row}>
                  <div>
                    <strong>
                      Job {job.jobNumber}: {job.summary}
                    </strong>
                    <div style={styles.muted}>
                      {job.locationName} - {job.billToCustomerName}
                    </div>
                  </div>
                  <select
                    value={job.status}
                    onChange={(event) =>
                      void handleJobStatusChange(
                        job.id,
                        event.target.value as 'open' | 'closed' | 'posted' | 'cancelled'
                      )
                    }
                    style={styles.input}
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="posted">Posted</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div style={styles.grid}>
                  {job.appointments.map((appointment) => (
                    <div key={appointment.id} style={styles.subpanel}>
                      <strong>{appointment.scheduledDate || 'Unscheduled'}</strong>
                      <div style={styles.muted}>
                        {appointment.timeWindowLabel || 'No window'} - {appointment.technicianName || 'Unassigned'}
                      </div>
                      <select
                        value={appointment.status}
                        onChange={(event) =>
                          void handleAppointmentStatusChange(
                            appointment.id,
                            event.target.value as AppointmentStatus
                          )
                        }
                        style={styles.input}
                      >
                        <option value="assigned">Assigned</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="onTheWay">On the way</option>
                        <option value="arrived">Arrived</option>
                        <option value="working">Working</option>
                        <option value="finished">Finished</option>
                        <option value="noAnswer">No answer</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  ))}
                </div>
                <div style={styles.formRow}>
                  <input
                    value={draft.scheduledDate}
                    onChange={(event) =>
                      setAppointmentDrafts((current) => ({
                        ...current,
                        [job.id]: { ...draft, scheduledDate: event.target.value }
                      }))
                    }
                    type="date"
                    style={styles.input}
                  />
                  <input
                    value={draft.timeWindowLabel}
                    onChange={(event) =>
                      setAppointmentDrafts((current) => ({
                        ...current,
                        [job.id]: { ...draft, timeWindowLabel: event.target.value }
                      }))
                    }
                    placeholder="Time window"
                    style={styles.input}
                  />
                  <select
                    value={draft.technicianId}
                    onChange={(event) =>
                      setAppointmentDrafts((current) => ({
                        ...current,
                        [job.id]: { ...draft, technicianId: event.target.value }
                      }))
                    }
                    style={styles.input}
                  >
                    <option value="">Unassigned</option>
                    {(jobsWorkspace?.technicians ?? []).map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.displayName}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void handleAddAppointment(job.id)} style={styles.button}>
                    Add appointment
                  </button>
                </div>
                <ul style={styles.timeline}>
                  {job.timeline.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.actorName}</strong>: {entry.message}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f1e8', color: '#1f2933', fontFamily: 'Arial, sans-serif', padding: '2rem' },
  card: { background: '#fffdf7', border: '1px solid #e5dcc8', borderRadius: 20, margin: '0 auto 1rem', maxWidth: '76rem', padding: '1.5rem' },
  row: { alignItems: 'center', display: 'flex', gap: '0.75rem', justifyContent: 'space-between', flexWrap: 'wrap' },
  grid: { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' },
  list: { display: 'grid', gap: '1rem' },
  formRow: { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', margin: '1rem 0' },
  panel: { background: '#ffffff', border: '1px solid #eadfc9', borderRadius: 16, display: 'grid', gap: '0.75rem', padding: '1rem' },
  subpanel: { background: '#faf7ef', borderRadius: 12, display: 'grid', gap: '0.5rem', padding: '0.75rem' },
  input: { background: '#ffffff', border: '1px solid #d9c8ad', borderRadius: 12, fontSize: '0.95rem', padding: '0.75rem 0.9rem' },
  button: { background: '#ffffff', border: '1px solid #cdbfa6', borderRadius: 999, color: '#1f2933', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, padding: '0.75rem 1rem' },
  inlineLabel: { alignItems: 'center', display: 'flex', gap: '0.5rem', fontSize: '0.95rem', fontWeight: 600 },
  title: { fontSize: '2rem', margin: '0 0 0.25rem' },
  heading: { fontSize: '1.15rem', margin: 0 },
  kicker: { color: '#9a6b2f', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.12em', marginBottom: '0.5rem', textTransform: 'uppercase' },
  muted: { color: '#52606d', margin: 0 },
  error: { color: '#b42318', margin: '0.75rem 0 0' },
  timeline: { margin: 0, paddingInlineStart: '1.1rem' }
};
