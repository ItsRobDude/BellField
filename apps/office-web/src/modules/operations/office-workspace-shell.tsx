'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acknowledgeOfficeFinishedVisitReview,
  addOfficeAppointment,
  getOfficeDispatchBoard,
  getOfficeMediaAttachments,
  getOfficeMediaBlob,
  getOfficeRegisterEntries,
  getOfficeJobDetail,
  createOfficeJob,
  getOfficeCustomerDetail,
  getOfficeJobIntakeContext,
  getOfficeJobsQueue,
  getOfficeLocationDetail,
  searchOfficeCrm,
  updateOfficeAppointmentSchedule,
  updateOfficeAppointmentStatus,
  updateOfficeJobStatus,
  updateOfficeMediaAttachment,
  updateOfficeRegisterEntry,
  voidOfficeMediaAttachment,
  voidOfficeRegisterEntry,
  type AppointmentStatus,
  type CrmSearchResult,
  type CustomerDetail,
  type DispatchBoardResponse,
  type JobDetailResponse,
  type JobIntakeContextResponse,
  type JobStatus,
  type JobsQueueKey,
  type JobsQueueResponse
} from '@/lib/operations-api';
import { getCurrentOfficeSession, type EmployeeSummary } from '@/lib/identity-api';
import { getDateInputValue } from './dispatch-date-picker';
import type {
  JobIntakeBillToOption,
  JobIntakeCustomerLocationOption,
  JobIntakeSelectedLocation
} from './job-intake-panel';
import {
  createEmptyAppointmentDraft,
  type AppointmentDraft,
  type AppointmentEditDraft,
  type CapturedWorkDetails,
  type JobDetailTab,
  type PendingJobStatusChange,
  type RegisterEntryEditDraft
} from './job-work-types';
import { OfficeWorkspaceFrame, type OfficeView } from './office-workspace-frame';
import {
  buildCapturedWorkDetails,
  createLoadingCapturedWorkDetails,
  dedupeBillToOptions,
  getJobStatusReviewMessage,
  mergeJobsQueueSection,
  optionalString,
  parseOptionalNumber,
  parseRequiredNumber,
  toActiveCustomerLocationOptions,
  toJobIntakeSelectedLocation
} from './office-workspace-shell-helpers';
import { OfficeWorkspaceLoadingState } from './office-workspace-loading-state';
import { OfficeWorkspaceSurfaces } from './office-workspace-surfaces';

const dispatchAutoRefreshIntervalMs = 60_000;
const jobsQueuePageLimit = 20;
const jobIntakeSearchDebounceMs = 250;

type Props = {
  apiBaseUrl: string;
  initialEmployee: EmployeeSummary;
  sessionToken: string;
  onSignOut: () => void;
};

export function OfficeWorkspaceShell({
  apiBaseUrl,
  initialEmployee,
  sessionToken,
  onSignOut
}: Props) {
  const [employee, setEmployee] = useState(initialEmployee);
  const [jobIntakeContext, setJobIntakeContext] = useState<JobIntakeContextResponse | null>(null);
  const [jobsQueue, setJobsQueue] = useState<JobsQueueResponse | null>(null);
  const [dispatchBoard, setDispatchBoard] = useState<DispatchBoardResponse | null>(null);
  const [jobDetailsById, setJobDetailsById] = useState<Record<string, JobDetailResponse>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDispatchRefreshing, setIsDispatchRefreshing] = useState(false);
  const [isJobsQueueRefreshing, setIsJobsQueueRefreshing] = useState(false);
  const [isJobIntakeLoading, setIsJobIntakeLoading] = useState(false);
  const [isJobDetailLoading, setIsJobDetailLoading] = useState(false);
  const [lastDispatchRefreshedAt, setLastDispatchRefreshedAt] = useState<string | null>(null);
  const [pendingJobStatusChange, setPendingJobStatusChange] =
    useState<PendingJobStatusChange | null>(null);
  const [jobLocationId, setJobLocationId] = useState('');
  const [selectedJobLocation, setSelectedJobLocation] = useState<JobIntakeSelectedLocation | null>(
    null
  );
  const [jobLocationSearchQuery, setJobLocationSearchQuery] = useState('');
  const [jobLocationSearchResults, setJobLocationSearchResults] = useState<CrmSearchResult[]>([]);
  const [isJobLocationSearchLoading, setIsJobLocationSearchLoading] = useState(false);
  const [customerLocationOptions, setCustomerLocationOptions] = useState<
    JobIntakeCustomerLocationOption[]
  >([]);
  const [customerLocationMessage, setCustomerLocationMessage] = useState<string | null>(null);
  const [jobBillToOptions, setJobBillToOptions] = useState<JobIntakeBillToOption[]>([]);
  const [jobBillToWarning, setJobBillToWarning] = useState<string | null>(null);
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
  const [appointmentEditDrafts, setAppointmentEditDrafts] = useState<
    Record<string, AppointmentEditDraft>
  >({});
  const [capturedWorkByJobId, setCapturedWorkByJobId] = useState<
    Record<string, CapturedWorkDetails>
  >({});
  const [dispatchViewDate, setDispatchViewDate] = useState(() => getDateInputValue());
  const [activeOfficeView, setActiveOfficeView] = useState<OfficeView>('dispatch');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [focusedAppointmentId, setFocusedAppointmentId] = useState<string | null>(null);
  const [jobDetailInitialTab, setJobDetailInitialTab] = useState<JobDetailTab>('overview');
  const [isJobIntakeOpen, setIsJobIntakeOpen] = useState(false);
  const refreshInFlightRef = useRef(false);
  const dispatchRefreshInFlightRef = useRef(false);
  const jobsQueueRefreshInFlightRef = useRef(false);
  const jobIntakeLoadInFlightRef = useRef(false);
  const jobLocationSearchRequestRef = useRef(0);

  const canViewInventory = employee.effectivePermissions.includes('inventory:view');
  const canCreateInventory = employee.effectivePermissions.includes('inventory:create');
  const canEditInventory = employee.effectivePermissions.includes('inventory:edit');
  const canViewPurchasing = employee.effectivePermissions.includes('purchasing:view');
  const canCreatePurchasing = employee.effectivePermissions.includes('purchasing:create');
  const canEditPurchasing = employee.effectivePermissions.includes('purchasing:edit');
  const canViewJobCosting = employee.effectivePermissions.includes('jobCosting:view');
  const canCreateJobCosting = employee.effectivePermissions.includes('jobCosting:create');
  const canEditJobCosting = employee.effectivePermissions.includes('jobCosting:edit');
  const canReplaceRemoveEquipment = employee.effectivePermissions.includes('equipment:configure');
  const canDeleteEquipment = employee.effectivePermissions.includes('equipment:delete');
  const canCreateEstimate = employee.effectivePermissions.includes('estimates:create');
  const canEditEstimate = employee.effectivePermissions.includes('estimates:edit');
  const canApproveEstimate = employee.effectivePermissions.includes('estimates:approve');
  const canViewInvoice = employee.effectivePermissions.includes('invoices:view');
  const canEditInvoice = employee.effectivePermissions.includes('invoices:edit');
  const canPostInvoice = employee.effectivePermissions.includes('invoices:post');
  // Converting an approved estimate writes invoice lines, so it is gated on
  // invoices:create (the same authority that creates billing).
  const canConvertEstimate = employee.effectivePermissions.includes('invoices:create');
  // Payments are a bookkeeping function on their own permission area, separate from
  // invoice view/edit.
  const paymentPermissions = {
    canView: employee.effectivePermissions.includes('payments:view'),
    canRecord: employee.effectivePermissions.includes('payments:create'),
    canVoid: employee.effectivePermissions.includes('payments:edit')
  };

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
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to refresh the dispatch board.'
      );
      return false;
    } finally {
      dispatchRefreshInFlightRef.current = false;
      setIsDispatchRefreshing(false);
    }
  }, [apiBaseUrl, dispatchViewDate, sessionToken]);

  const refreshJobsQueue = useCallback(async (): Promise<boolean> => {
    if (jobsQueueRefreshInFlightRef.current) {
      return false;
    }

    jobsQueueRefreshInFlightRef.current = true;
    setIsJobsQueueRefreshing(true);
    setErrorMessage(null);

    try {
      const nextJobsQueue = await getOfficeJobsQueue({
        sessionToken,
        apiBaseUrl,
        limit: jobsQueuePageLimit
      });
      setJobsQueue(nextJobsQueue);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh the jobs queue.');
      return false;
    } finally {
      jobsQueueRefreshInFlightRef.current = false;
      setIsJobsQueueRefreshing(false);
    }
  }, [apiBaseUrl, sessionToken]);

  const loadJobIntakeContext = useCallback(
    async (force = false): Promise<JobIntakeContextResponse | null> => {
      if (!force && jobIntakeContext) {
        return jobIntakeContext;
      }

      if (jobIntakeLoadInFlightRef.current) {
        return jobIntakeContext;
      }

      jobIntakeLoadInFlightRef.current = true;
      setIsJobIntakeLoading(true);
      setErrorMessage(null);

      try {
        const nextJobIntakeContext = await getOfficeJobIntakeContext({ sessionToken, apiBaseUrl });
        setJobIntakeContext(nextJobIntakeContext);

        return nextJobIntakeContext;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load job intake.');
        return null;
      } finally {
        jobIntakeLoadInFlightRef.current = false;
        setIsJobIntakeLoading(false);
      }
    },
    [apiBaseUrl, jobIntakeContext, sessionToken]
  );

  useEffect(() => {
    const requestId = jobLocationSearchRequestRef.current + 1;
    jobLocationSearchRequestRef.current = requestId;
    const trimmedQuery = jobLocationSearchQuery.trim();

    if (!isJobIntakeOpen || selectedJobLocation || trimmedQuery.length < 2) {
      setJobLocationSearchResults([]);
      setIsJobLocationSearchLoading(false);
      return;
    }

    setIsJobLocationSearchLoading(true);
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await searchOfficeCrm({
            sessionToken,
            apiBaseUrl,
            query: trimmedQuery
          });

          if (jobLocationSearchRequestRef.current !== requestId) {
            return;
          }

          setJobLocationSearchResults(
            response.results.filter(
              (result) => result.kind === 'location' || result.kind === 'customer'
            )
          );
        } catch (error) {
          if (jobLocationSearchRequestRef.current !== requestId) {
            return;
          }

          setJobLocationSearchResults([]);
          setErrorMessage(error instanceof Error ? error.message : 'Unable to search CRM.');
        } finally {
          if (jobLocationSearchRequestRef.current === requestId) {
            setIsJobLocationSearchLoading(false);
          }
        }
      })();
    }, jobIntakeSearchDebounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [apiBaseUrl, isJobIntakeOpen, jobLocationSearchQuery, selectedJobLocation, sessionToken]);

  const refreshWorkspace = useCallback(async (): Promise<boolean> => {
    if (refreshInFlightRef.current) {
      return false;
    }

    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const currentSession = await getCurrentOfficeSession({ sessionToken, apiBaseUrl });

      setEmployee(currentSession.employee);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to refresh the office workspace.'
      );
      return false;
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [apiBaseUrl, sessionToken]);

  const refreshAllWorkspace = useCallback(async (): Promise<boolean> => {
    const refreshes: Array<Promise<boolean>> = [
      refreshWorkspace(),
      refreshDispatchBoard(),
      refreshJobsQueue()
    ];

    if (jobIntakeContext || isJobIntakeOpen) {
      refreshes.push(loadJobIntakeContext(true).then(Boolean));
    }

    const results = await Promise.all(refreshes);
    return results.some(Boolean);
  }, [
    isJobIntakeOpen,
    jobIntakeContext,
    loadJobIntakeContext,
    refreshDispatchBoard,
    refreshJobsQueue,
    refreshWorkspace
  ]);

  const loadJobDetail = useCallback(
    async (jobId: string): Promise<JobDetailResponse | null> => {
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
          [jobId]: buildCapturedWorkDetails(
            detail.registerEntries,
            detail.mediaAttachments,
            current[jobId]
          )
        }));
        return detail;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load job detail.');
        return null;
      } finally {
        setIsJobDetailLoading(false);
      }
    },
    [apiBaseUrl, sessionToken]
  );

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    void refreshDispatchBoard();
  }, [refreshDispatchBoard]);

  useEffect(() => {
    void refreshJobsQueue();
  }, [refreshJobsQueue]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshDispatchBoard();
    }, dispatchAutoRefreshIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [refreshDispatchBoard]);

  async function handleLoadMoreJobsQueue(queueKey: JobsQueueKey, cursor: string) {
    try {
      const nextPage = await getOfficeJobsQueue({
        sessionToken,
        apiBaseUrl,
        limit: jobsQueuePageLimit,
        cursors: { [queueKey]: cursor }
      });
      setJobsQueue((current) =>
        current ? mergeJobsQueueSection(current, nextPage, queueKey) : nextPage
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load more jobs.');
    }
  }

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
        [jobId]: buildCapturedWorkDetails(
          registerResponse.registerEntries,
          mediaResponse.mediaAttachments,
          current[jobId]
        )
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

  function handleRegisterDraftChange(
    jobId: string,
    registerEntryId: string,
    draft: RegisterEntryEditDraft
  ) {
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
        reason: optionalString(
          capturedWorkByJobId[jobId]?.registerVoidReasons[registerEntryId] ?? ''
        )
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

  function clearJobIntakeLocationSelection() {
    setJobLocationId('');
    setSelectedJobLocation(null);
    setJobBillToCustomerId('');
    setJobBillToOptions([]);
    setJobBillToWarning(null);
    setJobLocationSearchQuery('');
    setJobLocationSearchResults([]);
    setIsJobLocationSearchLoading(false);
    setCustomerLocationOptions([]);
    setCustomerLocationMessage(null);
  }

  async function handleLoadJobIntakeLocation(locationId: string) {
    try {
      setErrorMessage(null);
      const location = await getOfficeLocationDetail({ sessionToken, apiBaseUrl, locationId });
      const ownerBillToOption = {
        id: location.customerId,
        name: location.customerName
      };
      const alternateIds = location.alternateBillToCustomerIds.filter(
        (customerId) => customerId !== location.customerId
      );
      const alternateResults = await Promise.allSettled(
        alternateIds.map((customerId) =>
          getOfficeCustomerDetail({ sessionToken, apiBaseUrl, customerId })
        )
      );
      const alternateBillToOptions = alternateResults
        .filter(
          (result): result is PromiseFulfilledResult<CustomerDetail> =>
            result.status === 'fulfilled'
        )
        .map((result) => ({
          id: result.value.id,
          name: result.value.name
        }));
      const failedAlternateCount = alternateResults.filter(
        (result) => result.status === 'rejected'
      ).length;

      setSelectedJobLocation(toJobIntakeSelectedLocation(location));
      setJobLocationId(location.id);
      setJobBillToOptions(dedupeBillToOptions([ownerBillToOption, ...alternateBillToOptions]));
      setJobBillToCustomerId(ownerBillToOption.id);
      setJobBillToWarning(
        failedAlternateCount > 0
          ? 'Some alternate bill-to customers could not be loaded. The location owner remains available.'
          : null
      );
      setJobLocationSearchQuery('');
      setJobLocationSearchResults([]);
      setIsJobLocationSearchLoading(false);
      setCustomerLocationOptions([]);
      setCustomerLocationMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load location detail.');
    }
  }

  async function handleSelectJobIntakeSearchResult(result: CrmSearchResult) {
    if (result.kind === 'location') {
      await handleLoadJobIntakeLocation(result.id);
      return;
    }

    if (result.kind !== 'customer') {
      return;
    }

    try {
      setErrorMessage(null);
      clearJobIntakeLocationSelection();
      const customer = await getOfficeCustomerDetail({
        sessionToken,
        apiBaseUrl,
        customerId: result.id
      });
      const activeLocations = toActiveCustomerLocationOptions(customer);

      setCustomerLocationOptions(activeLocations);
      setCustomerLocationMessage(
        activeLocations.length === 0
          ? `No active locations found for ${customer.name}. Open Customers to create a location before creating the job.`
          : null
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load customer detail.');
    }
  }

  async function handleCreateJob() {
    if (!jobLocationId) {
      setErrorMessage('Select a location before creating a job.');
      return;
    }

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
      clearJobIntakeLocationSelection();
      setIsJobIntakeOpen(false);
      setNoticeMessage('Job created.');
      await refreshAllWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create job.');
    }
  }

  async function handleOpenJobIntake() {
    const context = jobIntakeContext ?? (await loadJobIntakeContext());

    if (context) {
      setIsJobIntakeOpen(true);
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
      nextStatus === 'cancelled'
        ? (jobDetailsById[jobId]?.job.appointments.filter(
            (appointment) => appointment.status !== 'cancelled'
          ).length ?? 0)
        : 0;

    setPendingJobStatusChange({
      jobId,
      currentStatus,
      nextStatus,
      jobSummary,
      reviewMessage: getJobStatusReviewMessage(
        currentStatus,
        nextStatus,
        jobSummary,
        cancellableAppointmentCount
      ),
      cancellableAppointmentCount,
      isSubmitting: false
    });
  }

  function getJobIdForAppointment(appointmentId: string): string | null {
    const selectedDetail = selectedJobId ? jobDetailsById[selectedJobId] : null;
    if (selectedDetail?.job.appointments.some((appointment) => appointment.id === appointmentId)) {
      return selectedDetail.job.id;
    }

    const loadedJobDetail = Object.values(jobDetailsById).find((detail) =>
      detail.job.appointments.some((appointment) => appointment.id === appointmentId)
    );
    return loadedJobDetail?.job.id ?? null;
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
    setPendingJobStatusChange((current) =>
      current ? { ...current, isSubmitting: true } : current
    );
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
      setPendingJobStatusChange((current) =>
        current ? { ...current, isSubmitting: false } : current
      );
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
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to update appointment status.'
      );
    }
  }

  function handleAppointmentDraftChange(jobId: string, patch: Partial<AppointmentDraft>) {
    setAppointmentDrafts((current) => ({
      ...current,
      [jobId]: { ...(current[jobId] ?? createEmptyAppointmentDraft()), ...patch }
    }));
  }

  function handleAppointmentEditDraftChange(
    appointmentId: string,
    baseDraft: AppointmentEditDraft,
    patch: Partial<AppointmentEditDraft>
  ) {
    setAppointmentEditDrafts((current) => ({
      ...current,
      [appointmentId]: { ...(current[appointmentId] ?? baseDraft), ...patch }
    }));
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
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to update appointment scheduling.'
      );
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
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to acknowledge finished visit review.'
      );
    }
  }

  function handleJobDateChange(nextDate: string) {
    setJobDate(nextDate);

    if (!nextDate) {
      setJobStartTime('');
      setJobEndTime('');
    }
  }

  function handleOpenJobDetail(
    jobId: string,
    appointmentId?: string,
    initialTab: JobDetailTab = 'overview'
  ) {
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
      <OfficeWorkspaceLoadingState
        employee={employee}
        errorMessage={errorMessage}
        isDispatchRefreshing={isDispatchRefreshing}
      />
    );
  }

  return (
    <OfficeWorkspaceFrame
      activeView={activeOfficeView}
      employee={employee}
      errorMessage={errorMessage}
      isDispatchRefreshing={isDispatchRefreshing}
      isJobIntakeLoading={isJobIntakeLoading}
      isJobsQueueRefreshing={isJobsQueueRefreshing}
      isRefreshing={isRefreshing}
      canViewInventory={canViewInventory}
      canViewPurchasing={canViewPurchasing}
      canViewBookkeeping={canViewInvoice}
      noticeMessage={noticeMessage}
      onOpenJobIntake={() => void handleOpenJobIntake()}
      onRefresh={() => void refreshAllWorkspace()}
      onSignOut={onSignOut}
      onViewChange={setActiveOfficeView}
    >
      <OfficeWorkspaceSurfaces
        activeOfficeView={activeOfficeView}
        crm={{
          apiBaseUrl,
          sessionToken,
          canReplaceRemoveEquipment,
          canDeleteEquipment,
          onErrorMessage: setErrorMessage
        }}
        dispatch={{
          dispatchBoard,
          dispatchViewDate,
          isDispatchRefreshing,
          lastDispatchRefreshedAt,
          onDispatchViewDateChange: handleDispatchViewDateChange,
          onDispatchRefresh: handleDispatchRefresh,
          onOpenJobDetail: handleOpenJobDetail
        }}
        jobIntake={{
          isOpen: isJobIntakeOpen,
          context: jobIntakeContext,
          locationSearchQuery: jobLocationSearchQuery,
          locationSearchResults: jobLocationSearchResults,
          isLocationSearchLoading: isJobLocationSearchLoading,
          selectedLocation: selectedJobLocation,
          customerLocationOptions,
          customerLocationMessage,
          billToOptions: jobBillToOptions,
          billToWarning: jobBillToWarning,
          jobBillToCustomerId,
          jobType,
          jobCategory,
          jobOrigin,
          jobSummary,
          jobTechnicianId,
          jobDate,
          jobStartTime,
          jobEndTime,
          jobWindow,
          onLocationSearchQueryChange: setJobLocationSearchQuery,
          onSelectLocationSearchResult: (result) => void handleSelectJobIntakeSearchResult(result),
          onSelectCustomerLocation: (locationId) => void handleLoadJobIntakeLocation(locationId),
          onClearSelectedLocation: clearJobIntakeLocationSelection,
          onJobBillToCustomerChange: setJobBillToCustomerId,
          onJobTypeChange: setJobType,
          onJobCategoryChange: setJobCategory,
          onJobOriginChange: setJobOrigin,
          onJobSummaryChange: setJobSummary,
          onJobTechnicianChange: setJobTechnicianId,
          onJobDateChange: handleJobDateChange,
          onJobStartTimeChange: setJobStartTime,
          onJobEndTimeChange: setJobEndTime,
          onJobWindowChange: setJobWindow,
          onCreateJob: handleCreateJob,
          onClose: () => setIsJobIntakeOpen(false)
        }}
        jobs={{
          jobsQueue,
          onOpenJobDetail: handleOpenJobDetail,
          onOpenJobIntake: () => void handleOpenJobIntake(),
          onLoadMoreJobsQueue: handleLoadMoreJobsQueue
        }}
        inventory={{
          apiBaseUrl,
          sessionToken,
          canCreate: canCreateInventory,
          canEdit: canEditInventory,
          onOpenJob: (jobId) => handleOpenJobDetail(jobId)
        }}
        purchasing={{
          apiBaseUrl,
          sessionToken,
          canCreate: canCreatePurchasing,
          canEdit: canEditPurchasing,
          onOpenJob: (jobId) => handleOpenJobDetail(jobId)
        }}
        bookkeeping={{
          apiBaseUrl,
          sessionToken,
          onOpenJob: (jobId) => handleOpenJobDetail(jobId, undefined, 'invoice')
        }}
        jobDetail={{
          selectedJobId,
          jobDetailsById,
          apiBaseUrl,
          sessionToken,
          canCreateEstimate,
          canEditEstimate,
          canApproveEstimate,
          canViewInvoice,
          canEditInvoice,
          canPostInvoice,
          canConvertEstimate,
          canViewJobCosting,
          canCreateJobCosting,
          canEditJobCosting,
          paymentPermissions,
          focusedAppointmentId,
          jobDetailInitialTab,
          isJobDetailLoading,
          jobsQueueFallback: {
            jobsQueue,
            onOpenJobDetail: handleOpenJobDetail,
            onOpenJobIntake: () => void handleOpenJobIntake(),
            onLoadMoreJobsQueue: handleLoadMoreJobsQueue
          },
          pendingJobStatusChange,
          appointmentDrafts,
          appointmentEditDrafts,
          capturedWorkByJobId,
          onJobDetailBack: () => setActiveOfficeView('dispatch'),
          onLoadCapturedWork: loadCapturedWork,
          onJobStatusReviewRequested: handleJobStatusReviewRequested,
          onConfirmJobStatusChange: confirmJobStatusChange,
          onCancelJobStatusChange: () => setPendingJobStatusChange(null),
          onAppointmentStatusChange: handleAppointmentStatusChange,
          onAppointmentDraftChange: handleAppointmentDraftChange,
          onAppointmentEditDraftChange: handleAppointmentEditDraftChange,
          onSaveAppointmentSchedule: handleSaveAppointmentSchedule,
          onAddAppointment: handleAddAppointment,
          onKeepJobOpen: handleKeepJobOpen,
          onRegisterDraftChange: handleRegisterDraftChange,
          onSaveRegisterEntry: handleSaveRegisterEntry,
          onRegisterVoidReasonChange: handleRegisterVoidReasonChange,
          onVoidRegisterEntry: handleVoidRegisterEntry,
          onMediaCaptionChange: handleMediaCaptionChange,
          onSaveMediaCaption: handleSaveMediaCaption,
          onMediaVoidReasonChange: handleMediaVoidReasonChange,
          onVoidMediaAttachment: handleVoidMediaAttachment,
          onOpenMediaAttachment: handleOpenMediaAttachment
        }}
      />
    </OfficeWorkspaceFrame>
  );
}
