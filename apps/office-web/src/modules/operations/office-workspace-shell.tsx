'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  acknowledgeOfficeFinishedVisitReview,
  addOfficeAppointment,
  createOfficeEquipment,
  deleteOfficeEquipment,
  getOfficeEquipmentDetail,
  createOfficeJob,
  getOfficeEquipmentWorkspace,
  getOfficeJobsWorkspace,
  linkOfficeEquipmentReplacement,
  updateOfficeAppointmentSchedule,
  updateOfficeAppointmentStatus,
  updateOfficeEquipment,
  updateOfficeJobStatus,
  type AppointmentStatus,
  type EquipmentDetail,
  type EquipmentSummary,
  type JobStatus,
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
import { CrmPanel } from './crm-panel';
import { DispatchBoardPanel, type DispatchScheduleDraft } from './dispatch-board-panel';
import { EquipmentPanel, type EquipmentCreateDraft, type EquipmentEditDraft } from './equipment-panel';
import {
  getOfficeJobElementId,
  JobsAppointmentsPanel,
  type AppointmentDraft,
  type AppointmentEditDraft
} from './jobs-appointments-panel';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

const plannedOfficeAreas = ['Accounts', 'Locations', 'Jobs', 'Dispatch', 'Invoices', 'Reports'];

type Props = {
  apiBaseUrl: string;
  initialEmployee: EmployeeSummary;
  sessionToken: string;
  onSignOut: () => void;
};

type PendingJobStatusChange = {
  jobId: string;
  currentStatus: JobStatus;
  nextStatus: JobStatus;
  jobSummary: string;
  reviewMessage: string;
  cancellableAppointmentCount: number;
  isSubmitting: boolean;
};

function canViewEmployees(employee: EmployeeSummary | null): boolean {
  return employee?.effectivePermissions.includes('employeesPermissions:view') ?? false;
}

function getJobStatusReviewMessage(
  currentStatus: JobStatus,
  nextStatus: JobStatus,
  jobSummary: string,
  cancellableAppointmentCount = 0
): string {
  if (currentStatus === nextStatus) {
    return `Job "${jobSummary}" is already ${nextStatus}.`;
  }

  if (nextStatus === 'completed') {
    return `Marking "${jobSummary}" completed means the work looks done operationally, but office closeout can still happen later.`;
  }

  if (nextStatus === 'closed') {
    return `Closing "${jobSummary}" is the administrative closeout step. BellField will still warn if future appointments remain.`;
  }

  if (nextStatus === 'cancelled') {
    if (cancellableAppointmentCount === 0) {
      return `Cancelling "${jobSummary}" will not cancel any appointments because none are active. Is that okay?`;
    }

    return `Cancelling "${jobSummary}" will also cancel ${formatAppointmentCount(cancellableAppointmentCount)} under it. Is that okay?`;
  }

  if (nextStatus === 'waitingOnParts') {
    return `Setting "${jobSummary}" to waiting on parts keeps the job visible without pretending it is fully scheduled or complete.`;
  }

  if (nextStatus === 'inProgress') {
    return `Moving "${jobSummary}" to in progress should reflect active work underway, not final closeout.`;
  }

  return `Moving "${jobSummary}" back into an active status keeps its history intact while the office continues work or schedules follow-up appointments.`;
}

function countCancellableAppointmentsForJob(workspace: JobsWorkspaceResponse | null, jobId: string): number {
  const job = workspace?.jobs.find((workspaceJob) => workspaceJob.id === jobId);
  return job?.appointments.filter((appointment) => appointment.status !== 'cancelled').length ?? 0;
}

function formatAppointmentCount(count: number): string {
  return `${count} ${count === 1 ? 'appointment' : 'appointments'}`;
}

function getDateInputValue(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

export function OfficeWorkspaceShell({ apiBaseUrl, initialEmployee, sessionToken, onSignOut }: Props) {
  const [employee, setEmployee] = useState(initialEmployee);
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [jobsWorkspace, setJobsWorkspace] = useState<JobsWorkspaceResponse | null>(null);
  const [equipment, setEquipment] = useState<EquipmentSummary[]>([]);
  const [suggestedEquipmentTypes, setSuggestedEquipmentTypes] = useState<string[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | undefined>();
  const [selectedEquipmentDetail, setSelectedEquipmentDetail] = useState<EquipmentDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingJobStatusChange, setPendingJobStatusChange] = useState<PendingJobStatusChange | null>(null);
  const [showInactiveEquipment, setShowInactiveEquipment] = useState(false);
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
  const [appointmentEditDrafts, setAppointmentEditDrafts] = useState<Record<string, AppointmentEditDraft>>({});
  const [dispatchViewDate, setDispatchViewDate] = useState(() => getDateInputValue());
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);

  const locationLookup = useMemo(
    () => new Map((jobsWorkspace?.locations ?? []).map((location) => [location.id, location])),
    [jobsWorkspace]
  );

  useEffect(() => {
    void refreshWorkspace();
  }, [showInactiveEquipment]);

  const canReplaceRemoveEquipment = employee.effectivePermissions.includes('equipment:configure');
  const canDeleteEquipment = employee.effectivePermissions.includes('equipment:delete');

  async function loadEquipmentDetail(equipmentId: string) {
    const equipmentDetail = await getOfficeEquipmentDetail({ equipmentId, sessionToken, apiBaseUrl });
    setSelectedEquipmentId(equipmentId);
    setSelectedEquipmentDetail(equipmentDetail);
  }

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
      setSuggestedEquipmentTypes(nextEquipmentWorkspace.suggestedEquipmentTypes);

      if (!jobLocationId && nextJobsWorkspace.locations[0]) {
        setJobLocationId(nextJobsWorkspace.locations[0].id);
        setJobBillToCustomerId(nextJobsWorkspace.locations[0].customerId);
      }

      if (canViewEmployees(currentSession.employee)) {
        const employeeResponse = await getOfficeEmployees({ sessionToken, apiBaseUrl });
        setEmployees(employeeResponse.employees);
      } else {
        setEmployees([]);
      }

      const nextSelectedEquipmentId =
        selectedEquipmentId && nextEquipmentWorkspace.equipment.some((record) => record.id === selectedEquipmentId)
          ? selectedEquipmentId
          : nextEquipmentWorkspace.equipment[0]?.id;

      if (nextSelectedEquipmentId) {
        await loadEquipmentDetail(nextSelectedEquipmentId);
      } else {
        setSelectedEquipmentId(undefined);
        setSelectedEquipmentDetail(null);
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

  async function handleCreateEquipment(draft: EquipmentCreateDraft) {
    try {
      await createOfficeEquipment({
        sessionToken,
        apiBaseUrl,
        locationId: draft.placementKind === 'location' ? draft.locationId || undefined : undefined,
        inventoryLocationLabel: draft.placementKind === 'inventory' ? draft.inventoryLocationLabel || undefined : undefined,
        equipmentType: draft.equipmentType,
        brand: draft.brand,
        model: draft.model,
        serialNumber: draft.serialNumber,
        filterSizes: splitFilterSizes(draft.filterSizes),
        equipmentLocationDescription: draft.equipmentLocationDescription || undefined,
        installDate: draft.installDate || undefined,
        warrantyStartDate: draft.warrantyStartDate || undefined,
        warrantyEndDate: draft.warrantyEndDate || undefined,
        warrantyProviderNote: draft.warrantyProviderNote || undefined,
        systemGroupName: draft.systemGroupName || undefined,
        notes: draft.notes || undefined,
        status: draft.status
      });
      await refreshWorkspace();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Serial number is strongly recommended') &&
        window.confirm('Serial number is blank. Create this equipment record anyway?')
      ) {
        await createOfficeEquipment({
          sessionToken,
          apiBaseUrl,
          locationId: draft.placementKind === 'location' ? draft.locationId || undefined : undefined,
          inventoryLocationLabel: draft.placementKind === 'inventory' ? draft.inventoryLocationLabel || undefined : undefined,
          equipmentType: draft.equipmentType,
          brand: draft.brand,
          model: draft.model,
          serialNumber: draft.serialNumber,
          filterSizes: splitFilterSizes(draft.filterSizes),
          equipmentLocationDescription: draft.equipmentLocationDescription || undefined,
          installDate: draft.installDate || undefined,
          warrantyStartDate: draft.warrantyStartDate || undefined,
          warrantyEndDate: draft.warrantyEndDate || undefined,
          warrantyProviderNote: draft.warrantyProviderNote || undefined,
          systemGroupName: draft.systemGroupName || undefined,
          notes: draft.notes || undefined,
          status: draft.status,
          confirmMissingSerial: true
        });
        await refreshWorkspace();
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Unable to add equipment.');
    }
  }

  async function handleEquipmentUpdate(recordId: string, draft: EquipmentEditDraft) {
    try {
      await updateOfficeEquipment({
        equipmentId: recordId,
        sessionToken,
        apiBaseUrl,
        locationId: draft.locationId,
        inventoryLocationLabel: draft.inventoryLocationLabel,
        equipmentType: draft.equipmentType,
        brand: draft.brand,
        model: draft.model,
        serialNumber: draft.serialNumber,
        filterSizes: splitFilterSizes(draft.filterSizes),
        equipmentLocationDescription: draft.equipmentLocationDescription,
        installDate: draft.installDate,
        warrantyStartDate: draft.warrantyStartDate || undefined,
        warrantyEndDate: draft.warrantyEndDate || undefined,
        warrantyProviderNote: draft.warrantyProviderNote || undefined,
        systemGroupName: draft.systemGroupName || undefined,
        clearSystemGroup: draft.systemGroupName.trim().length === 0,
        status: draft.status,
        notes: draft.notes
      });
      await loadEquipmentDetail(recordId);
      await refreshWorkspace();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Serial number is strongly recommended') &&
        window.confirm('Serial number is blank. Save this equipment change anyway?')
      ) {
        await updateOfficeEquipment({
          equipmentId: recordId,
          sessionToken,
          apiBaseUrl,
          locationId: draft.locationId,
          inventoryLocationLabel: draft.inventoryLocationLabel,
          equipmentType: draft.equipmentType,
          brand: draft.brand,
          model: draft.model,
          serialNumber: draft.serialNumber,
          filterSizes: splitFilterSizes(draft.filterSizes),
          equipmentLocationDescription: draft.equipmentLocationDescription,
          installDate: draft.installDate,
          warrantyStartDate: draft.warrantyStartDate || undefined,
          warrantyEndDate: draft.warrantyEndDate || undefined,
          warrantyProviderNote: draft.warrantyProviderNote || undefined,
          systemGroupName: draft.systemGroupName || undefined,
          clearSystemGroup: draft.systemGroupName.trim().length === 0,
          status: draft.status,
          notes: draft.notes,
          confirmMissingSerial: true
        });
        await loadEquipmentDetail(recordId);
        await refreshWorkspace();
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Unable to update equipment.');
    }
  }

  async function handleEquipmentSelect(equipmentId: string) {
    try {
      await loadEquipmentDetail(equipmentId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load equipment detail.');
    }
  }

  async function handleLinkReplacement(equipmentId: string, replacementEquipmentId: string) {
    try {
      await linkOfficeEquipmentReplacement({
        equipmentId,
        replacementEquipmentId,
        sessionToken,
        apiBaseUrl
      });
      await loadEquipmentDetail(equipmentId);
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to link replacement equipment.');
    }
  }

  async function handleDeleteEquipment(equipmentId: string) {
    if (!window.confirm('Delete this equipment record permanently?')) {
      return;
    }

    try {
      await deleteOfficeEquipment({
        equipmentId,
        sessionToken,
        apiBaseUrl,
        confirmDelete: true
      });
      setSelectedEquipmentId(undefined);
      setSelectedEquipmentDetail(null);
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete equipment.');
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

  function handleJobStatusReviewRequested(
    jobId: string,
    currentStatus: JobStatus,
    nextStatus: JobStatus,
    jobSummary: string
  ) {
    if (currentStatus === nextStatus) {
      setPendingJobStatusChange(null);
      return;
    }

    const cancellableAppointmentCount =
      nextStatus === 'cancelled' ? countCancellableAppointmentsForJob(jobsWorkspace, jobId) : 0;

    setPendingJobStatusChange({
      jobId,
      currentStatus,
      nextStatus,
      jobSummary,
      reviewMessage: getJobStatusReviewMessage(currentStatus, nextStatus, jobSummary, cancellableAppointmentCount),
      cancellableAppointmentCount,
      isSubmitting: false
    });
  }

  async function confirmJobStatusChange() {
    if (!pendingJobStatusChange) {
      return;
    }

    setPendingJobStatusChange((current) => (current ? { ...current, isSubmitting: true } : current));
    setNoticeMessage(null);

    try {
      const response = await updateOfficeJobStatus({
        jobId: pendingJobStatusChange.jobId,
        status: pendingJobStatusChange.nextStatus,
        sessionToken,
        apiBaseUrl
      });

      setNoticeMessage(response.warningMessages?.join(' ') ?? 'Job status updated.');

      setPendingJobStatusChange(null);
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update job status.');
      setPendingJobStatusChange((current) => (current ? { ...current, isSubmitting: false } : current));
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

  async function handleSaveAppointmentSchedule(appointmentId: string) {
    const draft = appointmentEditDrafts[appointmentId];

    if (!draft) {
      return;
    }

    try {
      await updateOfficeAppointmentSchedule({
        appointmentId,
        sessionToken,
        apiBaseUrl,
        scheduledDate: draft.scheduledDate || undefined,
        timeWindowLabel: draft.timeWindowLabel || undefined,
        technicianId: draft.technicianId || undefined
      });
      setAppointmentEditDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[appointmentId];
        return nextDrafts;
      });
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update appointment scheduling.');
    }
  }

  async function handleDispatchStatusChange(appointmentId: string, status: AppointmentStatus) {
    try {
      setNoticeMessage(null);
      await updateOfficeAppointmentStatus({ appointmentId, status, sessionToken, apiBaseUrl });
      await refreshWorkspace();

      if (status === 'cancelled') {
        setNoticeMessage('Appointment cancelled. It is no longer shown on the dispatch board.');
        return;
      }

      if (status === 'finished') {
        setNoticeMessage('Appointment marked finished. Office review may be needed.');
        return;
      }

      setNoticeMessage('Dispatch status updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update dispatch status.');
    }
  }

  async function handleSaveDispatchSchedule(appointmentId: string, draft: DispatchScheduleDraft) {
    const previousDispatchDate = dispatchViewDate;

    try {
      setNoticeMessage(null);
      await updateOfficeAppointmentSchedule({
        appointmentId,
        sessionToken,
        apiBaseUrl,
        scheduledDate: draft.scheduledDate || undefined,
        timeWindowLabel: draft.timeWindowLabel || undefined,
        technicianId: draft.technicianId || undefined
      });
      setAppointmentEditDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[appointmentId];
        return nextDrafts;
      });
      await refreshWorkspace();

      if (draft.scheduledDate && draft.scheduledDate !== previousDispatchDate) {
        setNoticeMessage(
          `Appointment moved to ${draft.scheduledDate}. It is no longer shown on the ${previousDispatchDate} dispatch board.`
        );
        return;
      }

      if (!draft.scheduledDate) {
        setNoticeMessage(`Appointment moved off the ${previousDispatchDate} dispatch board as unscheduled work.`);
        return;
      }

      setNoticeMessage('Dispatch schedule updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update dispatch scheduling.');
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
      setNoticeMessage('Follow-up appointment added. Finished visit review was acknowledged.');
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add appointment.');
    }
  }

  async function handleKeepJobOpen(jobId: string) {
    try {
      await acknowledgeOfficeFinishedVisitReview({
        jobId,
        decision: 'keptOpen',
        sessionToken,
        apiBaseUrl
      });
      setNoticeMessage('Finished visit review acknowledged. The job remains open.');
      await refreshWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to acknowledge finished visit review.');
    }
  }

  function handleJobLocationChange(nextLocationId: string) {
    const nextLocation = locationLookup.get(nextLocationId);
    setJobLocationId(nextLocationId);
    setJobBillToCustomerId(nextLocation?.customerId ?? '');
  }

  function handleOpenDispatchJob(jobId: string) {
    setFocusedJobId(jobId);
    document.getElementById(getOfficeJobElementId(jobId))?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start'
    });
  }

  function handleDispatchViewDateChange(nextDate: string) {
    setDispatchViewDate(nextDate || getDateInputValue());
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
        {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}
      </section>

      {canViewEmployees(employee) ? (
        <EmployeeManagementPanel employees={employees} roles={roles} onEmployeeUpdate={handleEmployeeUpdate} />
      ) : null}

      <CrmPanel apiBaseUrl={apiBaseUrl} sessionToken={sessionToken} onErrorMessage={setErrorMessage} />

      <EquipmentPanel
        locations={jobsWorkspace.locations}
        equipment={equipment}
        suggestedEquipmentTypes={suggestedEquipmentTypes}
        selectedEquipmentId={selectedEquipmentId}
        selectedEquipmentDetail={selectedEquipmentDetail}
        showInactiveEquipment={showInactiveEquipment}
        canReplaceRemove={canReplaceRemoveEquipment}
        canDelete={canDeleteEquipment}
        onSelectEquipment={handleEquipmentSelect}
        onShowInactiveChange={setShowInactiveEquipment}
        onCreateEquipment={handleCreateEquipment}
        onRecordUpdate={handleEquipmentUpdate}
        onLinkReplacement={handleLinkReplacement}
        onDeleteEquipment={handleDeleteEquipment}
      />

      <DispatchBoardPanel
        jobsWorkspace={jobsWorkspace}
        viewDate={dispatchViewDate}
        onViewDateChange={handleDispatchViewDateChange}
        onOpenInJobsPanel={handleOpenDispatchJob}
        onSaveAppointmentSchedule={handleSaveDispatchSchedule}
        onUpdateAppointmentStatus={handleDispatchStatusChange}
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
        appointmentEditDrafts={appointmentEditDrafts}
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
        onAppointmentEditDraftChange={(appointmentId, draft) =>
          setAppointmentEditDrafts((current) => ({ ...current, [appointmentId]: draft }))
        }
        onCreateJob={handleCreateJob}
        pendingJobStatusChange={pendingJobStatusChange}
        onJobStatusReviewRequested={handleJobStatusReviewRequested}
        onConfirmJobStatusChange={confirmJobStatusChange}
        onCancelJobStatusChange={() => setPendingJobStatusChange(null)}
        onAppointmentStatusChange={handleAppointmentStatusChange}
        onSaveAppointmentSchedule={handleSaveAppointmentSchedule}
        onAddAppointment={handleAddAppointment}
        onKeepJobOpen={handleKeepJobOpen}
        focusedJobId={focusedJobId}
      />
    </main>
  );
}

function splitFilterSizes(filterSizes: string): string[] {
  return filterSizes
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
