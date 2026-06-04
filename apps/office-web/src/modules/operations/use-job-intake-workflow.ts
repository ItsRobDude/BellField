import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createOfficeCustomer,
  createOfficeJob,
  createOfficeLocation,
  getOfficeCustomerDetail,
  getOfficeJobIntakeContext,
  getOfficeLocationDetail,
  searchOfficeCrm,
  type CreateCustomerRequest,
  type CreateLocationRequest,
  type CrmSearchResult,
  type CustomerDetail,
  type DuplicateCandidate,
  type JobIntakeContextResponse
} from '@/lib/operations-api';
import type {
  JobIntakeBillToOption,
  JobIntakeCreateCustomerResult,
  JobIntakeCreateLocationResult,
  JobIntakeCustomerLocationOption,
  JobIntakeSelectedCustomer,
  JobIntakeSelectedLocation
} from './job-intake-panel';
import type { OfficeJobIntakeSurfaceProps } from './office-workspace-job-intake-surface';
import {
  dedupeBillToOptions,
  toActiveCustomerLocationOptions,
  toJobIntakeSelectedLocation
} from './office-workspace-shell-helpers';

const jobIntakeSearchDebounceMs = 250;

type UseJobIntakeWorkflowInput = {
  apiBaseUrl: string;
  sessionToken: string;
  isOpen: boolean;
  onClose: () => void;
  onErrorMessage: (message: string | null) => void;
  onNoticeMessage: (message: string | null) => void;
  onJobCreated: () => Promise<unknown>;
};

export function useJobIntakeWorkflow({
  apiBaseUrl,
  sessionToken,
  isOpen,
  onClose,
  onErrorMessage,
  onNoticeMessage,
  onJobCreated
}: UseJobIntakeWorkflowInput) {
  const [context, setContext] = useState<JobIntakeContextResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [jobLocationId, setJobLocationId] = useState('');
  const [selectedJobLocation, setSelectedJobLocation] = useState<JobIntakeSelectedLocation | null>(
    null
  );
  const [selectedJobCustomer, setSelectedJobCustomer] = useState<JobIntakeSelectedCustomer | null>(
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
  const loadInFlightRef = useRef(false);
  const searchRequestRef = useRef(0);

  const loadContext = useCallback(
    async (force = false): Promise<JobIntakeContextResponse | null> => {
      if (!force && context) {
        return context;
      }

      if (loadInFlightRef.current) {
        return context;
      }

      loadInFlightRef.current = true;
      setIsLoading(true);
      onErrorMessage(null);

      try {
        const nextContext = await getOfficeJobIntakeContext({ sessionToken, apiBaseUrl });
        setContext(nextContext);

        return nextContext;
      } catch (error) {
        onErrorMessage(error instanceof Error ? error.message : 'Unable to load job intake.');
        return null;
      } finally {
        loadInFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [apiBaseUrl, context, onErrorMessage, sessionToken]
  );

  useEffect(() => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    const trimmedQuery = jobLocationSearchQuery.trim();

    if (!isOpen || selectedJobLocation || trimmedQuery.length < 2) {
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

          if (searchRequestRef.current !== requestId) {
            return;
          }

          setJobLocationSearchResults(
            response.results.filter(
              (result) => result.kind === 'location' || result.kind === 'customer'
            )
          );
        } catch (error) {
          if (searchRequestRef.current !== requestId) {
            return;
          }

          setJobLocationSearchResults([]);
          onErrorMessage(error instanceof Error ? error.message : 'Unable to search CRM.');
        } finally {
          if (searchRequestRef.current === requestId) {
            setIsJobLocationSearchLoading(false);
          }
        }
      })();
    }, jobIntakeSearchDebounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [
    apiBaseUrl,
    isOpen,
    jobLocationSearchQuery,
    onErrorMessage,
    selectedJobLocation,
    sessionToken
  ]);

  function clearLocationSelection() {
    setJobLocationId('');
    setSelectedJobLocation(null);
    setSelectedJobCustomer(null);
    setJobBillToCustomerId('');
    setJobBillToOptions([]);
    setJobBillToWarning(null);
    setJobLocationSearchQuery('');
    setJobLocationSearchResults([]);
    setIsJobLocationSearchLoading(false);
    setCustomerLocationOptions([]);
    setCustomerLocationMessage(null);
  }

  async function handleLoadLocation(locationId: string) {
    try {
      onErrorMessage(null);
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
      setSelectedJobCustomer(null);
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
      onErrorMessage(error instanceof Error ? error.message : 'Unable to load location detail.');
    }
  }

  async function handleSelectSearchResult(result: CrmSearchResult) {
    if (result.kind === 'location') {
      await handleLoadLocation(result.id);
      return;
    }

    if (result.kind !== 'customer') {
      return;
    }

    try {
      onErrorMessage(null);
      clearLocationSelection();
      const customer = await getOfficeCustomerDetail({
        sessionToken,
        apiBaseUrl,
        customerId: result.id
      });
      const activeLocations = toActiveCustomerLocationOptions(customer);

      setSelectedJobCustomer({ id: customer.id, name: customer.name });
      setCustomerLocationOptions(activeLocations);
      setCustomerLocationMessage(
        activeLocations.length === 0
          ? `No active locations found for ${customer.name}. Add a service location to continue.`
          : null
      );
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to load customer detail.');
    }
  }

  async function collectDuplicateWarnings(
    query: string,
    kind: 'customer' | 'location'
  ): Promise<DuplicateCandidate[]> {
    if (!query.trim()) {
      return [];
    }

    const response = await searchOfficeCrm({ sessionToken, apiBaseUrl, query });
    return response.results
      .filter((result) => result.kind === kind)
      .map((result) => ({
        id: result.id,
        kind,
        title: result.title,
        subtitle: result.subtitle,
        matchReasons: ['Likely duplicate based on search'],
        isActive: result.isActive,
        hasDoNotServiceFlag: result.badges.includes('DNU')
      }));
  }

  async function handleCreateCustomer(
    input: CreateCustomerRequest
  ): Promise<JobIntakeCreateCustomerResult> {
    try {
      onErrorMessage(null);

      if (!input.confirmDuplicate) {
        const duplicateWarnings = await collectDuplicateWarnings(
          buildCustomerDuplicateQuery(input),
          'customer'
        );

        if (duplicateWarnings.length > 0) {
          return { status: 'duplicate', duplicateWarnings };
        }
      }

      const response = await createOfficeCustomer({
        ...input,
        sessionToken,
        apiBaseUrl
      });
      const activeLocations = toActiveCustomerLocationOptions(response.customer);

      setJobLocationId('');
      setSelectedJobLocation(null);
      setSelectedJobCustomer({ id: response.customer.id, name: response.customer.name });
      setJobBillToCustomerId('');
      setJobBillToOptions([]);
      setJobBillToWarning(null);
      setJobLocationSearchQuery('');
      setJobLocationSearchResults([]);
      setIsJobLocationSearchLoading(false);
      setCustomerLocationOptions(activeLocations);
      setCustomerLocationMessage(
        activeLocations.length === 0
          ? `Add a service location for ${response.customer.name} to continue.`
          : null
      );

      return { status: 'created', customer: response.customer };
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to create customer.');
      throw error;
    }
  }

  async function handleCreateLocation(
    input: CreateLocationRequest
  ): Promise<JobIntakeCreateLocationResult> {
    try {
      onErrorMessage(null);

      if (!input.confirmMissingContactInfo && !input.phone?.trim() && !input.email?.trim()) {
        return { status: 'missingContact' };
      }

      if (!input.confirmDuplicate) {
        const duplicateWarnings = await collectDuplicateWarnings(
          buildLocationDuplicateQuery(input),
          'location'
        );

        if (duplicateWarnings.length > 0) {
          return { status: 'duplicate', duplicateWarnings };
        }
      }

      const response = await createOfficeLocation({
        ...input,
        sessionToken,
        apiBaseUrl
      });

      await handleLoadLocation(response.location.id);

      return { status: 'created', location: response.location };
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to create location.');
      throw error;
    }
  }

  async function handleCreateJob() {
    if (!jobLocationId) {
      onErrorMessage('Select a location before creating a job.');
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
      clearLocationSelection();
      onClose();
      onNoticeMessage('Job created.');
      await onJobCreated();
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to create job.');
    }
  }

  function handleJobDateChange(nextDate: string) {
    setJobDate(nextDate);

    if (!nextDate) {
      setJobStartTime('');
      setJobEndTime('');
    }
  }

  const surfaceProps: OfficeJobIntakeSurfaceProps = {
    isOpen,
    context,
    locationSearchQuery: jobLocationSearchQuery,
    locationSearchResults: jobLocationSearchResults,
    isLocationSearchLoading: isJobLocationSearchLoading,
    selectedLocation: selectedJobLocation,
    selectedCustomer: selectedJobCustomer,
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
    onSelectLocationSearchResult: (result) => void handleSelectSearchResult(result),
    onSelectCustomerLocation: (locationId) => void handleLoadLocation(locationId),
    onCreateCustomer: handleCreateCustomer,
    onCreateLocation: handleCreateLocation,
    onClearSelectedLocation: clearLocationSelection,
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
    onClose
  };

  return {
    hasContext: Boolean(context),
    isLoading,
    loadContext,
    surfaceProps
  };
}

function buildCustomerDuplicateQuery(input: CreateCustomerRequest): string {
  return [
    input.name,
    input.billingAddressLine1,
    input.billingCity,
    input.billingPostalCode,
    input.phone,
    input.email
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
}

function buildLocationDuplicateQuery(input: CreateLocationRequest): string {
  return [input.name, input.addressLine1, input.city, input.postalCode, input.phone, input.email]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
}
