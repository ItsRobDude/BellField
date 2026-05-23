'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acknowledgeOfficeFinishedVisitReview,
  addOfficeAppointment,
  createOfficeEquipment,
  deleteOfficeEquipment,
  getOfficeDispatchBoard,
  getOfficeEquipmentDetail,
  getOfficeMediaAttachments,
  getOfficeMediaBlob,
  getOfficeRegisterEntries,
  getOfficeJobDetail,
  createOfficeJob,
  getOfficeEquipmentWorkspace,
  getOfficeJobsWorkspace,
  linkOfficeEquipmentReplacement,
  updateOfficeAppointmentSchedule,
  updateOfficeAppointmentStatus,
  updateOfficeEquipment,
  updateOfficeJobStatus,
  updateOfficeMediaAttachment,
  updateOfficeRegisterEntry,
  voidOfficeMediaAttachment,
  voidOfficeRegisterEntry,
  type AppointmentStatus,
  type DispatchBoardResponse,
  type EquipmentDetail,
  type EquipmentSummary,
  type JobDetailResponse,
  type JobStatus,
  type JobsWorkspaceResponse,
  type MediaAttachmentSummary,
  type RegisterEntrySummary
} from '@/lib/operations-api';
import {
  getCurrentOfficeSession,
  type EmployeeSummary
} from '@/lib/identity-api';
import { CrmPanel } from './crm-panel';
import { DispatchBoardPanel } from './dispatch-board-panel';
import { EquipmentPanel, type EquipmentCreateDraft, type EquipmentEditDraft } from './equipment-panel';
import { JobDetailPanel } from './job-detail-panel';
import { JobIntakePanel } from './job-intake-panel';
import {
  createEmptyAppointmentDraft,
  type AppointmentDraft,
  type AppointmentEditDraft,
  type CapturedWorkDetails,
  type JobDetailTab,
  type PendingJobStatusChange,
  type RegisterEntryEditDraft
} from './job-work-types';
import { JobsQueuePanel } from './jobs-queue-panel';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

const dispatchAutoRefreshIntervalMs = 60_000;
type OfficeView = 'dispatch' | 'customers' | 'jobs' | 'equipment' | 'jobDetail';

type Props = {
  apiBaseUrl: string;
  initialEmployee: EmployeeSummary;
  sessionToken: string;
  onSignOut: () => void;
};

function getJobStatusReviewMessage(
  currentStatus: JobStatus,
  nextStatus: JobStatus,
  jobSummary: string,
  cancellableAppointmentCount = 0
): string {
  if (currentStatus === nextStatus) {
    return `Already ${formatJobStatusLabel(nextStatus)}.`;
  }

  if (nextStatus === 'cancelled') {
    if (cancellableAppointmentCount === 0) {
      return `Cancel "${jobSummary}"?`;
    }

    return `Cancel "${jobSummary}" and ${formatAppointmentCount(cancellableAppointmentCount)}?`;
  }

  return `Change status to ${formatJobStatusLabel(nextStatus)}?`;
}

function countCancellableAppointmentsForJob(workspace: JobsWorkspaceResponse | null, jobId: string): number {
  const job = workspace?.jobs.find((workspaceJob) => workspaceJob.id === jobId);
  return job?.appointments.filter((appointment) => appointment.status !== 'cancelled').length ?? 0;
}

function formatAppointmentCount(count: number): string {
  return `${count} ${count === 1 ? 'appointment' : 'appointments'}`;
}

function formatJobStatusLabel(status: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    new: 'New',
    scheduled: 'Scheduled',
    inProgress: 'In progress',
    waitingOnParts: 'Waiting on parts',
    completed: 'Completed',
    closed: 'Closed',
    cancelled: 'Cancelled'
  };

  return labels[status];
}

function getDateInputValue(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function createRegisterEntryDraft(entry: RegisterEntrySummary): RegisterEntryEditDraft {
  return {
    appointmentId: entry.appointmentId ?? '',
    kind: entry.kind,
    description: entry.description,
    quantity: String(entry.quantity),
    unitOfMeasure: entry.unitOfMeasure ?? '',
    unitPrice: entry.unitPrice === undefined ? '' : String(entry.unitPrice),
    totalAmount: String(entry.totalAmount),
    partNumber: entry.partNumber ?? '',
    inventorySourceLabel: entry.inventorySourceLabel ?? ''
  };
}

function buildCapturedWorkDetails(
  registerEntries: RegisterEntrySummary[],
  mediaAttachments: MediaAttachmentSummary[],
  previous?: CapturedWorkDetails
): CapturedWorkDetails {
  return {
    isOpen: previous?.isOpen ?? true,
    isLoading: false,
    registerEntries,
    mediaAttachments,
    registerDrafts: Object.fromEntries(registerEntries.map((entry) => [entry.id, createRegisterEntryDraft(entry)])),
    mediaCaptionDrafts: Object.fromEntries(mediaAttachments.map((media) => [media.id, media.caption ?? ''])),
    registerVoidReasons: previous?.registerVoidReasons ?? {},
    mediaVoidReasons: previous?.mediaVoidReasons ?? {}
  };
}

function createLoadingCapturedWorkDetails(previous?: CapturedWorkDetails): CapturedWorkDetails {
  return {
    isOpen: true,
    isLoading: true,
    registerEntries: previous?.registerEntries ?? [],
    mediaAttachments: previous?.mediaAttachments ?? [],
    registerDrafts: previous?.registerDrafts ?? {},
    mediaCaptionDrafts: previous?.mediaCaptionDrafts ?? {},
    registerVoidReasons: previous?.registerVoidReasons ?? {},
    mediaVoidReasons: previous?.mediaVoidReasons ?? {}
  };
}

function parseRequiredNumber(value: string, fieldLabel: string): number {
  if (!value.trim()) {
    throw new Error(`${fieldLabel} is required.`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldLabel} must be a valid number.`);
  }
  return parsed;
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  return parseRequiredNumber(value, 'Unit price');
}

function optionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function OfficeWorkspaceShell({ apiBaseUrl, initialEmployee, sessionToken, onSignOut }: Props) {
  const [employee, setEmployee] = useState(initialEmployee);
  const [jobsWorkspace, setJobsWorkspace] = useState<JobsWorkspaceResponse | null>(null);
  const [dispatchBoard, setDispatchBoard] = useState<DispatchBoardResponse | null>(null);
  const [jobDetailsById, setJobDetailsById] = useState<Record<string, JobDetailResponse>>({});
  const [equipment, setEquipment] = useState<EquipmentSummary[]>([]);
  const [suggestedEquipmentTypes, setSuggestedEquipmentTypes] = useState<string[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | undefined>();
  const [selectedEquipmentDetail, setSelectedEquipmentDetail] = useState<EquipmentDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDispatchRefreshing, setIsDispatchRefreshing] = useState(false);
  const [isJobDetailLoading, setIsJobDetailLoading] = useState(false);
  const [lastDispatchRefreshedAt, setLastDispatchRefreshedAt] = useState<string | null>(null);
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
  const [jobStartTime, setJobStartTime] = useState('');
  const [jobEndTime, setJobEndTime] = useState('');
  const [jobWindow, setJobWindow] = useState('');
  const [appointmentDrafts, setAppointmentDrafts] = useState<Record<string, AppointmentDraft>>({});
  const [appointmentEditDrafts, setAppointmentEditDrafts] = useState<Record<string, AppointmentEditDraft>>({});
  const [capturedWorkByJobId, setCapturedWorkByJobId] = useState<Record<string, CapturedWorkDetails>>({});
  const [dispatchViewDate, setDispatchViewDate] = useState(() => getDateInputValue());
  const [activeOfficeView, setActiveOfficeView] = useState<OfficeView>('dispatch');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [focusedAppointmentId, setFocusedAppointmentId] = useState<string | null>(null);
  const [jobDetailInitialTab, setJobDetailInitialTab] = useState<JobDetailTab>('overview');
  const [isJobIntakeOpen, setIsJobIntakeOpen] = useState(false);
  const refreshInFlightRef = useRef(false);
  const dispatchRefreshInFlightRef = useRef(false);
  const jobLocationIdRef = useRef(jobLocationId);
  const selectedEquipmentIdRef = useRef(selectedEquipmentId);

  const locationLookup = useMemo(
    () => new Map((jobsWorkspace?.locations ?? []).map((location) => [location.id, location])),
    [jobsWorkspace]
  );

  const canReplaceRemoveEquipment = employee.effectivePermissions.includes('equipment:configure');
  const canDeleteEquipment = employee.effectivePermissions.includes('equipment:delete');

  useEffect(() => {
    jobLocationIdRef.current = jobLocationId;
  }, [jobLocationId]);

  useEffect(() => {
    selectedEquipmentIdRef.current = selectedEquipmentId;
  }, [selectedEquipmentId]);

  const loadEquipmentDetail = useCallback(async (equipmentId: string) => {
    const equipmentDetail = await getOfficeEquipmentDetail({ equipmentId, sessionToken, apiBaseUrl });
    setSelectedEquipmentId(equipmentId);
    setSelectedEquipmentDetail(equipmentDetail);
  }, [apiBaseUrl, sessionToken]);

  const refreshDispatchBoard = useCallback(async (): Promise<boolean> => {
    if (dispatchRefreshInFlightRef.current) {
      return false;
    }

    dispatchRefreshInFlightRef.current = true;
    setIsDispatchRefreshing(true);
    setErrorMessage(null);

    try {
      const nextDispatchBoard = await getOfficeDispatchBoard({
        sessionToken,
        apiBaseUrl,
        startDate: dispatchViewDate,
        endDate: dispatchViewDate
      });
      setDispatchBoard(nextDispatchBoard);
      setLastDispatchRefreshedAt(new Date().toISOString());
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh the dispatch board.');
      return false;
    } finally {
      dispatchRefreshInFlightRef.current = false;
      setIsDispatchRefreshing(false);
    }
  }, [apiBaseUrl, dispatchViewDate, sessionToken]);

  const refreshWorkspace = useCallback(async (): Promise<boolean> => {
    if (refreshInFlightRef.current) {
      return false;
    }

    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const currentSession = await getCurrentOfficeSession({ sessionToken, apiBaseUrl });
      const nextJobsWorkspace = await getOfficeJobsWorkspace({ sessionToken, apiBaseUrl });
      const nextEquipmentWorkspace = await getOfficeEquipmentWorkspace({
        sessionToken,
        apiBaseUrl,
        includeInactive: showInactiveEquipment
      });

      setEmployee(currentSession.employee);
      setJobsWorkspace(nextJobsWorkspace);
      setEquipment(nextEquipmentWorkspace.equipment);
      setSuggestedEquipmentTypes(nextEquipmentWorkspace.suggestedEquipmentTypes);

      if (!jobLocationIdRef.current && nextJobsWorkspace.locations[0]) {
        setJobLocationId(nextJobsWorkspace.locations[0].id);
        setJobBillToCustomerId(nextJobsWorkspace.locations[0].customerId);
      }

      const nextSelectedEquipmentId =
        selectedEquipmentIdRef.current &&
        nextEquipmentWorkspace.equipment.some((record) => record.id === selectedEquipmentIdRef.current)
          ? selectedEquipmentIdRef.current
          : nextEquipmentWorkspace.equipment[0]?.id;

      if (nextSelectedEquipmentId) {
        await loadEquipmentDetail(nextSelectedEquipmentId);
      } else {
        setSelectedEquipmentId(undefined);
        setSelectedEquipmentDetail(null);
      }
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh the office workspace.');
      return false;
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [apiBaseUrl, loadEquipmentDetail, sessionToken, showInactiveEquipment]);

  const refreshAllWorkspace = useCallback(async (): Promise<boolean> => {
    const [didRefreshWorkspace, didRefreshDispatch] = await Promise.all([
      refreshWorkspace(),
      refreshDispatchBoard()
    ]);

    return didRefreshWorkspace || didRefreshDispatch;
  }, [refreshDispatchBoard, refreshWorkspace]);

  const loadJobDetail = useCallback(async (jobId: string): Promise<JobDetailResponse | null> => {
    setIsJobDetailLoading(true);
    setErrorMessage(null);

    try {
      const detail = await getOfficeJobDetail({ jobId, sessionToken, apiBaseUrl });
      setJobDetailsById((current) => ({
        ...current,
        [jobId]: detail
      }));
      setCapturedWorkByJobId((current) => ({
        ...current,
        [jobId]: buildCapturedWorkDetails(detail.registerEntries, detail.mediaAttachments, current[jobId])
      }));
      return detail;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load job detail.');
      return null;
    } finally {
      setIsJobDetailLoading(false);
    }
  }, [apiBaseUrl, sessionToken]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    void refreshDispatchBoard();
  }, [refreshDispatchBoard]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshDispatchBoard();
    }, dispatchAutoRefreshIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [refreshDispatchBoard]);

  async function loadCapturedWork(jobId: string) {
    setCapturedWorkByJobId((current) => ({
      ...current,
      [jobId]: createLoadingCapturedWorkDetails(current[jobId])
    }));

    try {
      const [registerResponse, mediaResponse] = await Promise.all([
        getOfficeRegisterEntries({ jobId, sessionToken, apiBaseUrl }),
        getOfficeMediaAttachments({ jobId, sessionToken, apiBaseUrl })
      ]);

      setCapturedWorkByJobId((current) => ({
        ...current,
        [jobId]: buildCapturedWorkDetails(registerResponse.registerEntries, mediaResponse.mediaAttachments, current[jobId])
      }));
    } catch (error) {
      setCapturedWorkByJobId((current) => ({
        ...current,
        [jobId]: {
          ...createLoadingCapturedWorkDetails(current[jobId]),
          isLoading: false
        }
      }));
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load captured work.');
    }
  }

  function handleRegisterDraftChange(jobId: string, registerEntryId: string, draft: RegisterEntryEditDraft) {
    setCapturedWorkByJobId((current) => ({
      ...current,
      [jobId]: {
        ...createLoadingCapturedWorkDetails(current[jobId]),
        isLoading: current[jobId]?.isLoading ?? false,
        registerDrafts: {
          ...(current[jobId]?.registerDrafts ?? {}),
          [registerEntryId]: draft
        }
      }
    }));
  }

  function handleRegisterVoidReasonChange(jobId: string, registerEntryId: string, reason: string) {
    setCapturedWorkByJobId((current) => ({
      ...current,
      [jobId]: {
        ...createLoadingCapturedWorkDetails(current[jobId]),
        isLoading: current[jobId]?.isLoading ?? false,
        registerVoidReasons: {
          ...(current[jobId]?.registerVoidReasons ?? {}),
          [registerEntryId]: reason
        }
      }
    }));
  }

  function handleMediaCaptionChange(jobId: string, mediaId: string, caption: string) {
    setCapturedWorkByJobId((current) => ({
      ...current,
      [jobId]: {
        ...createLoadingCapturedWorkDetails(current[jobId]),
        isLoading: current[jobId]?.isLoading ?? false,
        mediaCaptionDrafts: {
          ...(current[jobId]?.mediaCaptionDrafts ?? {}),
          [mediaId]: caption
        }
      }
    }));
  }

  function handleMediaVoidReasonChange(jobId: string, mediaId: string, reason: string) {
    setCapturedWorkByJobId((current) => ({
      ...current,
      [jobId]: {
        ...createLoadingCapturedWorkDetails(current[jobId]),
        isLoading: current[jobId]?.isLoading ?? false,
        mediaVoidReasons: {
          ...(current[jobId]?.mediaVoidReasons ?? {}),
          [mediaId]: reason
        }
      }
    }));
  }

  async function handleSaveRegisterEntry(jobId: string, registerEntryId: string) {
    const draft = capturedWorkByJobId[jobId]?.registerDrafts[registerEntryId];
    if (!draft) {
      return;
    }

    try {
      setNoticeMessage(null);
      await updateOfficeRegisterEntry({
        registerEntryId,
        sessionToken,
        apiBaseUrl,
        appointmentId: draft.appointmentId || null,
        kind: draft.kind,
        description: draft.description,
        quantity: parseRequiredNumber(draft.quantity, 'Quantity'),
        unitOfMeasure: optionalString(draft.unitOfMeasure),
        unitPrice: parseOptionalNumber(draft.unitPrice),
        totalAmount: parseRequiredNumber(draft.totalAmount, 'Total amount'),
        partNumber: optionalString(draft.partNumber),
        inventorySourceLabel: optionalString(draft.inventorySourceLabel)
      });
      setNoticeMessage('Register entry updated.');
      await refreshAllWorkspace();
      await loadJobDetail(jobId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update register entry.');
    }
  }

  async function handleVoidRegisterEntry(jobId: string, registerEntryId: string) {
    if (!window.confirm('Void this register entry?')) {
      return;
    }

    try {
      setNoticeMessage(null);
      await voidOfficeRegisterEntry({
        registerEntryId,
        sessionToken,
        apiBaseUrl,
        reason: optionalString(capturedWorkByJobId[jobId]?.registerVoidReasons[registerEntryId] ?? '')
      });
      setNoticeMessage('Register entry voided.');
      await refreshAllWorkspace();
      await loadJobDetail(jobId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to void register entry.');
    }
  }

  async function handleSaveMediaCaption(jobId: string, mediaId: string) {
    const caption = capturedWorkByJobId[jobId]?.mediaCaptionDrafts[mediaId] ?? '';

    try {
      setNoticeMessage(null);
      await updateOfficeMediaAttachment({
        mediaId,
        sessionToken,
        apiBaseUrl,
        caption: caption.trim() ? caption.trim() : null
      });
      setNoticeMessage('Media caption updated.');
      await refreshAllWorkspace();
      await loadJobDetail(jobId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update media caption.');
    }
  }

  async function handleVoidMediaAttachment(jobId: string, mediaId: string) {
    if (!window.confirm('Void this media attachment?')) {
      return;
    }

    try {
      setNoticeMessage(null);
      await voidOfficeMediaAttachment({
        mediaId,
        sessionToken,
        apiBaseUrl,
        reason: optionalString(capturedWorkByJobId[jobId]?.mediaVoidReasons[mediaId] ?? '')
      });
      setNoticeMessage('Media attachment voided.');
      await refreshAllWorkspace();
      await loadJobDetail(jobId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to void media attachment.');
    }
  }

  async function handleOpenMediaAttachment(_jobId: string, mediaId: string) {
    try {
      const blob = await getOfficeMediaBlob({ mediaId, sessionToken, apiBaseUrl });
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to open media attachment.');
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
      await refreshAllWorkspace();
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
        await refreshAllWorkspace();
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
      await refreshAllWorkspace();
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
        await refreshAllWorkspace();
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
      await refreshAllWorkspace();
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
      await refreshAllWorkspace();
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
        scheduledStartTime: jobDate ? jobStartTime || undefined : undefined,
        scheduledEndTime: jobDate ? jobEndTime || undefined : undefined,
        timeWindowLabel: jobWindow || undefined,
        technicianId: jobTechnicianId || undefined
      });
      setJobType('Service');
      setJobCategory('General');
      setJobOrigin('Inbound phone call');
      setJobSummary('');
      setJobDate('');
      setJobStartTime('');
      setJobEndTime('');
      setJobWindow('');
      setJobTechnicianId('');
      setIsJobIntakeOpen(false);
      setNoticeMessage('Job created.');
      await refreshAllWorkspace();
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

  function getJobIdForAppointment(appointmentId: string): string | null {
    const selectedDetail = selectedJobId ? jobDetailsById[selectedJobId] : null;
    if (selectedDetail?.job.appointments.some((appointment) => appointment.id === appointmentId)) {
      return selectedDetail.job.id;
    }

    const workspaceJob = jobsWorkspace?.jobs.find((job) =>
      job.appointments.some((appointment) => appointment.id === appointmentId)
    );
    return workspaceJob?.id ?? null;
  }

  async function refreshOpenJobDetail(jobId?: string | null) {
    const targetJobId = jobId ?? selectedJobId;

    if (targetJobId) {
      await loadJobDetail(targetJobId);
    }
  }

  async function confirmJobStatusChange() {
    if (!pendingJobStatusChange) {
      return;
    }

    const updatedJobId = pendingJobStatusChange.jobId;
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
      await refreshAllWorkspace();
      await refreshOpenJobDetail(updatedJobId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update job status.');
      setPendingJobStatusChange((current) => (current ? { ...current, isSubmitting: false } : current));
    }
  }

  async function handleAppointmentStatusChange(appointmentId: string, status: AppointmentStatus) {
    const jobId = getJobIdForAppointment(appointmentId);

    try {
      setNoticeMessage(null);
      await updateOfficeAppointmentStatus({ appointmentId, status, sessionToken, apiBaseUrl });
      await refreshAllWorkspace();
      await refreshOpenJobDetail(jobId);

      if (status === 'cancelled') {
        setNoticeMessage('Appointment cancelled.');
        return;
      }

      if (status === 'finished') {
        setNoticeMessage('Appointment finished.');
        return;
      }

      setNoticeMessage('Appointment status updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update appointment status.');
    }
  }

  async function handleSaveAppointmentSchedule(appointmentId: string) {
    const draft = appointmentEditDrafts[appointmentId];

    if (!draft) {
      return;
    }

    const jobId = getJobIdForAppointment(appointmentId);

    try {
      setNoticeMessage(null);
      await updateOfficeAppointmentSchedule({
        appointmentId,
        sessionToken,
        apiBaseUrl,
        scheduledDate: draft.scheduledDate || undefined,
        scheduledStartTime: draft.scheduledDate ? draft.scheduledStartTime || undefined : undefined,
        scheduledEndTime: draft.scheduledDate ? draft.scheduledEndTime || undefined : undefined,
        timeWindowLabel: draft.timeWindowLabel || undefined,
        technicianId: draft.technicianId || undefined
      });
      setAppointmentEditDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[appointmentId];
        return nextDrafts;
      });
      await refreshAllWorkspace();
      await refreshOpenJobDetail(jobId);
      setNoticeMessage('Appointment updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update appointment scheduling.');
    }
  }

  async function handleAddAppointment(jobId: string) {
    const draft = appointmentDrafts[jobId] ?? createEmptyAppointmentDraft();

    try {
      await addOfficeAppointment({
        jobId,
        sessionToken,
        apiBaseUrl,
        scheduledDate: draft.scheduledDate || undefined,
        scheduledStartTime: draft.scheduledDate ? draft.scheduledStartTime || undefined : undefined,
        scheduledEndTime: draft.scheduledDate ? draft.scheduledEndTime || undefined : undefined,
        timeWindowLabel: draft.timeWindowLabel || undefined,
        technicianId: draft.technicianId || undefined
      });
      setAppointmentDrafts((current) => ({
        ...current,
        [jobId]: createEmptyAppointmentDraft()
      }));
      setNoticeMessage('Follow-up added.');
      await refreshAllWorkspace();
      await refreshOpenJobDetail(jobId);
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
      setNoticeMessage('Review acknowledged.');
      await refreshAllWorkspace();
      await refreshOpenJobDetail(jobId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to acknowledge finished visit review.');
    }
  }

  function handleJobLocationChange(nextLocationId: string) {
    const nextLocation = locationLookup.get(nextLocationId);
    setJobLocationId(nextLocationId);
    setJobBillToCustomerId(nextLocation?.customerId ?? '');
  }

  function handleJobDateChange(nextDate: string) {
    setJobDate(nextDate);

    if (!nextDate) {
      setJobStartTime('');
      setJobEndTime('');
    }
  }

  function handleOpenJobDetail(jobId: string, appointmentId?: string, initialTab: JobDetailTab = 'overview') {
    setSelectedJobId(jobId);
    setFocusedAppointmentId(appointmentId ?? null);
    setJobDetailInitialTab(appointmentId ? 'appointments' : initialTab);
    setIsJobIntakeOpen(false);
    setActiveOfficeView('jobDetail');
    void loadJobDetail(jobId);
  }

  function handleDispatchViewDateChange(nextDate: string) {
    setDispatchViewDate(nextDate || getDateInputValue());
  }

  async function handleDispatchRefresh() {
    const didRefresh = await refreshDispatchBoard();

    if (didRefresh) {
      setNoticeMessage('Dispatch board refreshed.');
    }
  }

  if (!dispatchBoard) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.kicker}>BellField Office</div>
          <h1 style={styles.title}>{employee.displayName}</h1>
          <p style={styles.muted}>{isDispatchRefreshing ? 'Loading dispatch...' : 'Dispatch is not ready yet.'}</p>
          {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
        </section>
      </main>
    );
  }

  const selectedJobDetail = selectedJobId ? jobDetailsById[selectedJobId] ?? null : null;
  const selectedJob = selectedJobDetail?.job ?? null;

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <aside style={styles.rail} aria-label="Office navigation">
          <div style={styles.railBrand}>BellField</div>
          <NavButton label="Dispatch" active={activeOfficeView === 'dispatch'} onClick={() => setActiveOfficeView('dispatch')} />
          <NavButton label="Customers" active={activeOfficeView === 'customers'} onClick={() => setActiveOfficeView('customers')} />
          <NavButton label="Jobs" active={activeOfficeView === 'jobs'} onClick={() => setActiveOfficeView('jobs')} />
          <NavButton label="Equipment" active={activeOfficeView === 'equipment'} onClick={() => setActiveOfficeView('equipment')} />
        </aside>

        <div style={styles.workArea}>
          <section style={styles.topBar}>
            <div>
              <strong>{employee.displayName}</strong>
              <p style={styles.tinyMuted}>{employee.email}</p>
            </div>
            <div style={styles.row}>
              <button
                type="button"
                onClick={() => setIsJobIntakeOpen(true)}
                disabled={!jobsWorkspace}
                style={styles.primaryButton}
              >
                New job
              </button>
              <button type="button" onClick={() => void refreshAllWorkspace()} style={styles.button}>
                {isRefreshing || isDispatchRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              <button type="button" onClick={onSignOut} style={styles.button}>
                Sign out
              </button>
            </div>
          </section>

          {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
          {noticeMessage ? <p style={styles.notice}>{noticeMessage}</p> : null}

          {isJobIntakeOpen && jobsWorkspace ? (
            <JobIntakePanel
              jobsWorkspace={jobsWorkspace}
              jobLocationId={jobLocationId}
              jobBillToCustomerId={jobBillToCustomerId}
              jobType={jobType}
              jobCategory={jobCategory}
              jobOrigin={jobOrigin}
              jobSummary={jobSummary}
              jobTechnicianId={jobTechnicianId}
              jobDate={jobDate}
              jobStartTime={jobStartTime}
              jobEndTime={jobEndTime}
              jobWindow={jobWindow}
              onJobLocationChange={handleJobLocationChange}
              onJobBillToCustomerChange={setJobBillToCustomerId}
              onJobTypeChange={setJobType}
              onJobCategoryChange={setJobCategory}
              onJobOriginChange={setJobOrigin}
              onJobSummaryChange={setJobSummary}
              onJobTechnicianChange={setJobTechnicianId}
              onJobDateChange={handleJobDateChange}
              onJobStartTimeChange={setJobStartTime}
              onJobEndTimeChange={setJobEndTime}
              onJobWindowChange={setJobWindow}
              onCreateJob={handleCreateJob}
              onClose={() => setIsJobIntakeOpen(false)}
            />
          ) : null}

          {activeOfficeView === 'dispatch' ? (
            <DispatchBoardPanel
              dispatchBoard={dispatchBoard}
              viewDate={dispatchViewDate}
              onViewDateChange={handleDispatchViewDateChange}
              onOpenJobDetail={(jobId, appointmentId) => handleOpenJobDetail(jobId, appointmentId)}
              isRefreshing={isDispatchRefreshing}
              lastRefreshedAt={lastDispatchRefreshedAt}
              onRefresh={handleDispatchRefresh}
            />
          ) : null}

          {activeOfficeView === 'customers' ? (
            <CrmPanel apiBaseUrl={apiBaseUrl} sessionToken={sessionToken} onErrorMessage={setErrorMessage} />
          ) : null}

          {activeOfficeView === 'jobs' && jobsWorkspace ? (
            <JobsQueuePanel
              jobsWorkspace={jobsWorkspace}
              onOpenJobDetail={(jobId, appointmentId) => handleOpenJobDetail(jobId, appointmentId)}
              onNewJob={() => setIsJobIntakeOpen(true)}
            />
          ) : null}

          {activeOfficeView === 'jobs' && !jobsWorkspace ? (
            <section style={styles.workspacePanel} aria-label="Jobs queue">
              <p style={styles.muted}>Loading jobs...</p>
            </section>
          ) : null}

          {activeOfficeView === 'equipment' && jobsWorkspace ? (
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
          ) : null}

          {activeOfficeView === 'equipment' && !jobsWorkspace ? (
            <section style={styles.workspacePanel} aria-label="Equipment panel">
              <p style={styles.muted}>Loading equipment...</p>
            </section>
          ) : null}

          {activeOfficeView === 'jobDetail' && selectedJob && selectedJobDetail ? (
            <JobDetailPanel
              key={`${selectedJob.id}-${focusedAppointmentId ?? ''}-${jobDetailInitialTab}`}
              technicians={selectedJobDetail.technicians}
              job={selectedJob}
              initialTab={jobDetailInitialTab}
              focusedAppointmentId={focusedAppointmentId}
              timelineHasMore={selectedJobDetail.timelineHasMore}
              timelineLimit={selectedJobDetail.timelineLimit}
              pendingJobStatusChange={pendingJobStatusChange}
              appointmentDrafts={appointmentDrafts}
              appointmentEditDrafts={appointmentEditDrafts}
              capturedWork={capturedWorkByJobId[selectedJob.id]}
              onBack={() => setActiveOfficeView('dispatch')}
              onLoadCapturedWork={loadCapturedWork}
              onJobStatusReviewRequested={handleJobStatusReviewRequested}
              onConfirmJobStatusChange={confirmJobStatusChange}
              onCancelJobStatusChange={() => setPendingJobStatusChange(null)}
              onAppointmentStatusChange={handleAppointmentStatusChange}
              onAppointmentDraftChange={(jobId, draft) =>
                setAppointmentDrafts((current) => ({ ...current, [jobId]: draft }))
              }
              onAppointmentEditDraftChange={(appointmentId, draft) =>
                setAppointmentEditDrafts((current) => ({ ...current, [appointmentId]: draft }))
              }
              onSaveAppointmentSchedule={handleSaveAppointmentSchedule}
              onAddAppointment={handleAddAppointment}
              onKeepJobOpen={handleKeepJobOpen}
              onRegisterDraftChange={handleRegisterDraftChange}
              onSaveRegisterEntry={handleSaveRegisterEntry}
              onRegisterVoidReasonChange={handleRegisterVoidReasonChange}
              onVoidRegisterEntry={handleVoidRegisterEntry}
              onMediaCaptionChange={handleMediaCaptionChange}
              onSaveMediaCaption={handleSaveMediaCaption}
              onMediaVoidReasonChange={handleMediaVoidReasonChange}
              onVoidMediaAttachment={handleVoidMediaAttachment}
              onOpenMediaAttachment={handleOpenMediaAttachment}
            />
          ) : null}

          {activeOfficeView === 'jobDetail' && !selectedJob && isJobDetailLoading ? (
            <section style={styles.workspacePanel} aria-label="Job detail loading">
              <p style={styles.muted}>Loading job...</p>
            </section>
          ) : null}

          {activeOfficeView === 'jobDetail' && !selectedJob && !isJobDetailLoading && jobsWorkspace ? (
            <JobsQueuePanel
              jobsWorkspace={jobsWorkspace}
              onOpenJobDetail={(jobId, appointmentId) => handleOpenJobDetail(jobId, appointmentId)}
              onNewJob={() => setIsJobIntakeOpen(true)}
            />
          ) : null}

          {activeOfficeView === 'jobDetail' && !selectedJob && !isJobDetailLoading && !jobsWorkspace ? (
            <section style={styles.workspacePanel} aria-label="Job detail loading">
              <p style={styles.muted}>Loading job...</p>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function NavButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" style={active ? styles.activeRailButton : styles.railButton} onClick={onClick}>
      {label}
    </button>
  );
}

function splitFilterSizes(filterSizes: string): string[] {
  return filterSizes
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
