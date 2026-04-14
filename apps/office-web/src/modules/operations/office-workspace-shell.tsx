'use client';

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
import { EmployeeManagementPanel } from './employee-management-panel';
import { EquipmentPanel } from './equipment-panel';
import { JobsAppointmentsPanel, type AppointmentDraft } from './jobs-appointments-panel';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

const plannedOfficeAreas = ['Accounts', 'Locations', 'Jobs', 'Dispatch', 'Invoices', 'Reports'];

type Props = {
  apiBaseUrl: string;
  initialEmployee: EmployeeSummary;
  sessionToken: string;
  onSignOut: () => void;
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
  const [equipmentType, setEquipmentType] = useState('Condenser');
  const [equipmentBrand, setEquipmentBrand] = useState('Carrier');
  const [equipmentModel, setEquipmentModel] = useState('');
  const [equipmentSerial, setEquipmentSerial] = useState('');
  const [equipmentFilterSizes, setEquipmentFilterSizes] = useState('16x25x1');
  const [equipmentLocationDescription, setEquipmentLocationDescription] = useState('');
  const [equipmentInstallDate, setEquipmentInstallDate] = useState('');
  const [equipmentNotes, setEquipmentNotes] = useState('');
  const [equipmentLocationId, setEquipmentLocationId] = useState('');
  const [equipmentStatus, setEquipmentStatus] = useState<EquipmentStatus>('active');
  const [jobLocationId, setJobLocationId] = useState('');
  const [jobBillToCustomerId, setJobBillToCustomerId] = useState('');
  const [jobType, setJobType] = useState('Service');
  const [jobCategory, setJobCategory] = useState('General');
  const [jobOrigin, setJobOrigin] = useState('Inbound phone call');
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
        equipmentType,
        brand: equipmentBrand,
        model: equipmentModel,
        serialNumber: equipmentSerial,
        filterSizes: equipmentFilterSizes.split(','),
        equipmentLocationDescription: equipmentLocationDescription || undefined,
        installDate: equipmentInstallDate || undefined,
        notes: equipmentNotes || undefined,
        status: equipmentStatus
      });
      setEquipmentType('Condenser');
      setEquipmentBrand('Carrier');
      setEquipmentModel('');
      setEquipmentSerial('');
      setEquipmentFilterSizes('16x25x1');
      setEquipmentLocationDescription('');
      setEquipmentInstallDate('');
      setEquipmentNotes('');
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
        jobType,
        category: jobCategory,
        origin: jobOrigin,
        summary: jobSummary,
        scheduledDate: jobDate || undefined,
        timeWindowLabel: jobWindow || undefined,
        technicianId: jobTechnicianId || undefined
      });
      setJobType('Service');
      setJobCategory('General');
      setJobOrigin('Inbound phone call');
      setJobSummary('');
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create job.');
    }
  }

  async function handleJobStatusChange(jobId: string, status: 'open' | 'closed' | 'posted' | 'cancelled') {
    try {
      const response = await updateOfficeJobStatus({ jobId, status, sessionToken, apiBaseUrl });

      if (response.warningMessages?.length) {
        window.alert(response.warningMessages.join('\n'));
      }

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

  function handleJobLocationChange(nextLocationId: string) {
    const nextLocation = locationLookup.get(nextLocationId);
    setJobLocationId(nextLocationId);
    setJobBillToCustomerId(nextLocation?.customerId ?? '');
  }

  if (!jobsWorkspace) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.kicker}>BellField Office</div>
          <h1 style={styles.title}>{employee.displayName}</h1>
          <p style={styles.muted}>{isRefreshing ? 'Loading workspace...' : 'Workspace is not ready yet.'}</p>
          {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
        </section>
      </main>
    );
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
        <EmployeeManagementPanel employees={employees} roles={roles} onEmployeeUpdate={handleEmployeeUpdate} />
      ) : null}

      <EquipmentPanel
        locations={jobsWorkspace.locations}
        equipment={equipment}
        equipmentLocationId={equipmentLocationId}
        equipmentType={equipmentType}
        equipmentBrand={equipmentBrand}
        equipmentModel={equipmentModel}
        equipmentSerial={equipmentSerial}
        equipmentFilterSizes={equipmentFilterSizes}
        equipmentLocationDescription={equipmentLocationDescription}
        equipmentInstallDate={equipmentInstallDate}
        equipmentNotes={equipmentNotes}
        equipmentStatus={equipmentStatus}
        showInactiveEquipment={showInactiveEquipment}
        onEquipmentLocationChange={setEquipmentLocationId}
        onEquipmentTypeChange={setEquipmentType}
        onEquipmentBrandChange={setEquipmentBrand}
        onEquipmentModelChange={setEquipmentModel}
        onEquipmentSerialChange={setEquipmentSerial}
        onEquipmentFilterSizesChange={setEquipmentFilterSizes}
        onEquipmentLocationDescriptionChange={setEquipmentLocationDescription}
        onEquipmentInstallDateChange={setEquipmentInstallDate}
        onEquipmentNotesChange={setEquipmentNotes}
        onEquipmentStatusChange={setEquipmentStatus}
        onShowInactiveChange={setShowInactiveEquipment}
        onCreateEquipment={handleCreateEquipment}
        onRecordStatusChange={handleEquipmentStatusChange}
      />

      <JobsAppointmentsPanel
        jobsWorkspace={jobsWorkspace}
        jobLocationId={jobLocationId}
        jobBillToCustomerId={jobBillToCustomerId}
        jobType={jobType}
        jobCategory={jobCategory}
        jobOrigin={jobOrigin}
        jobSummary={jobSummary}
        jobTechnicianId={jobTechnicianId}
        jobDate={jobDate}
        jobWindow={jobWindow}
        appointmentDrafts={appointmentDrafts}
        onJobLocationChange={handleJobLocationChange}
        onJobBillToCustomerChange={setJobBillToCustomerId}
        onJobTypeChange={setJobType}
        onJobCategoryChange={setJobCategory}
        onJobOriginChange={setJobOrigin}
        onJobSummaryChange={setJobSummary}
        onJobTechnicianChange={setJobTechnicianId}
        onJobDateChange={setJobDate}
        onJobWindowChange={setJobWindow}
        onAppointmentDraftChange={(jobId, draft) =>
          setAppointmentDrafts((current) => ({ ...current, [jobId]: draft }))
        }
        onCreateJob={handleCreateJob}
        onJobStatusChange={handleJobStatusChange}
        onAppointmentStatusChange={handleAppointmentStatusChange}
        onAddAppointment={handleAddAppointment}
      />
    </main>
  );
}
