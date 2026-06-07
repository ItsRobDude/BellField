'use client';

import { useEffect, useState } from 'react';
import type {
  CreateCustomerRequest,
  CreateLocationRequest,
  CrmSearchResult,
  CustomerDetail,
  DuplicateCandidate,
  JobIntakeContextResponse,
  LocationDetail
} from '@/lib/operations-api';
import type { CustomerFormState, LocationFormState } from './crm-panel-types';
import {
  createEmptyCustomerForm,
  createEmptyLocationForm,
  optionalString,
  splitCommaValues
} from './job-intake-form-helpers';
import { JobDetailsStep, SelectedLocationCard } from './job-intake-details';
import {
  CustomerQuickCreateForm,
  ServiceLocationStep,
  type IntakeMode
} from './job-intake-quick-create';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type JobIntakeSelectedLocation = {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};

export type JobIntakeSelectedCustomer = {
  id: string;
  name: string;
};

export type JobIntakeCustomerLocationOption = {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};

export type JobIntakeCreateCustomerResult =
  | { status: 'created'; customer: CustomerDetail }
  | { status: 'duplicate'; duplicateWarnings: DuplicateCandidate[] };

export type JobIntakeCreateLocationResult =
  | { status: 'created'; location: LocationDetail }
  | { status: 'duplicate'; duplicateWarnings: DuplicateCandidate[] }
  | { status: 'missingContact' };

type JobIntakePanelProps = {
  intakeContext: JobIntakeContextResponse;
  locationSearchQuery: string;
  locationSearchResults: CrmSearchResult[];
  isLocationSearchLoading: boolean;
  selectedLocation: JobIntakeSelectedLocation | null;
  selectedCustomer: JobIntakeSelectedCustomer | null;
  customerLocationOptions: JobIntakeCustomerLocationOption[];
  customerLocationMessage: string | null;
  jobCustomerOverride: JobIntakeSelectedCustomer | null;
  jobCustomerSearchQuery: string;
  jobCustomerSearchResults: CrmSearchResult[];
  isJobCustomerSearchLoading: boolean;
  jobType: string;
  jobCategory: string;
  jobOrigin: string;
  jobSummary: string;
  jobTechnicianId: string;
  jobDate: string;
  jobStartTime: string;
  jobEndTime: string;
  jobWindow: string;
  onLocationSearchQueryChange: (query: string) => void;
  onSelectLocationSearchResult: (result: CrmSearchResult) => void;
  onSelectCustomerLocation: (locationId: string) => void;
  onCreateCustomer: (input: CreateCustomerRequest) => Promise<JobIntakeCreateCustomerResult>;
  onCreateJobCustomer: (input: CreateCustomerRequest) => Promise<JobIntakeCreateCustomerResult>;
  onCreateLocation: (input: CreateLocationRequest) => Promise<JobIntakeCreateLocationResult>;
  onClearSelectedLocation: () => void;
  onClearJobCustomerOverride: () => void;
  onJobCustomerSearchQueryChange: (query: string) => void;
  onSelectJobCustomerSearchResult: (result: CrmSearchResult) => void;
  onJobTypeChange: (value: string) => void;
  onJobCategoryChange: (value: string) => void;
  onJobOriginChange: (value: string) => void;
  onJobSummaryChange: (value: string) => void;
  onJobTechnicianChange: (value: string) => void;
  onJobDateChange: (value: string) => void;
  onJobStartTimeChange: (value: string) => void;
  onJobEndTimeChange: (value: string) => void;
  onJobWindowChange: (value: string) => void;
  onCreateJob: () => Promise<void>;
  onClose: () => void;
};

export function JobIntakePanel({
  intakeContext,
  locationSearchQuery,
  locationSearchResults,
  isLocationSearchLoading,
  selectedLocation,
  selectedCustomer,
  customerLocationOptions,
  customerLocationMessage,
  jobCustomerOverride,
  jobCustomerSearchQuery,
  jobCustomerSearchResults,
  isJobCustomerSearchLoading,
  jobType,
  jobCategory,
  jobOrigin,
  jobSummary,
  jobTechnicianId,
  jobDate,
  jobStartTime,
  jobEndTime,
  jobWindow,
  onLocationSearchQueryChange,
  onSelectLocationSearchResult,
  onSelectCustomerLocation,
  onCreateCustomer,
  onCreateJobCustomer,
  onCreateLocation,
  onClearSelectedLocation,
  onClearJobCustomerOverride,
  onJobCustomerSearchQueryChange,
  onSelectJobCustomerSearchResult,
  onJobTypeChange,
  onJobCategoryChange,
  onJobOriginChange,
  onJobSummaryChange,
  onJobTechnicianChange,
  onJobDateChange,
  onJobStartTimeChange,
  onJobEndTimeChange,
  onJobWindowChange,
  onCreateJob,
  onClose
}: JobIntakePanelProps) {
  const [intakeMode, setIntakeMode] = useState<IntakeMode>('search');
  const [jobCustomerMode, setJobCustomerMode] = useState<'closed' | 'search' | 'newCustomer'>(
    'closed'
  );
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createEmptyCustomerForm());
  const [jobCustomerForm, setJobCustomerForm] =
    useState<CustomerFormState>(createEmptyCustomerForm());
  const [locationForm, setLocationForm] = useState<LocationFormState>(createEmptyLocationForm());
  const [customerDuplicateWarnings, setCustomerDuplicateWarnings] = useState<DuplicateCandidate[]>(
    []
  );
  const [jobCustomerDuplicateWarnings, setJobCustomerDuplicateWarnings] = useState<
    DuplicateCandidate[]
  >([]);
  const [locationDuplicateWarnings, setLocationDuplicateWarnings] = useState<DuplicateCandidate[]>(
    []
  );
  const [locationMissingContactConfirmation, setLocationMissingContactConfirmation] =
    useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isCreatingJobCustomer, setIsCreatingJobCustomer] = useState(false);
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCustomer) {
      return;
    }

    setLocationForm((current) => ({ ...current, customerId: selectedCustomer.id }));
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedLocation) {
      return;
    }

    setIntakeMode('search');
    setCustomerDuplicateWarnings([]);
    setLocationDuplicateWarnings([]);
    setLocationMissingContactConfirmation(false);
    setCreateMessage(null);
  }, [selectedLocation]);

  useEffect(() => {
    if (!jobCustomerOverride) {
      return;
    }

    setJobCustomerMode('closed');
    setJobCustomerDuplicateWarnings([]);
    setJobCustomerForm(createEmptyCustomerForm());
  }, [jobCustomerOverride]);

  const visibleLocationSearchResults = locationSearchResults.filter(
    (result) => result.kind === 'location' || result.kind === 'customer'
  );
  const createJobButtonStyle = selectedLocation
    ? styles.primaryButton
    : { ...styles.primaryButton, cursor: 'not-allowed', opacity: 0.55 };

  async function submitCustomer(confirmDuplicate = false) {
    setIsCreatingCustomer(true);
    setCreateMessage(null);

    try {
      const result = await onCreateCustomer({
        name: customerForm.name.trim(),
        accountType: customerForm.accountType,
        billingAddressLine1: customerForm.billingAddressLine1.trim(),
        billingCity: customerForm.billingCity.trim(),
        billingState: customerForm.billingState.trim(),
        billingPostalCode: customerForm.billingPostalCode.trim(),
        phone: optionalString(customerForm.phone),
        email: optionalString(customerForm.email),
        fax: optionalString(customerForm.fax),
        flags: splitCommaValues(customerForm.flags),
        confirmDuplicate
      });

      if (result.status === 'duplicate') {
        setCustomerDuplicateWarnings(result.duplicateWarnings);
        return;
      }

      setCustomerForm(createEmptyCustomerForm());
      setCustomerDuplicateWarnings([]);
      setLocationForm(createEmptyLocationForm(result.customer.id));
      setIntakeMode('newLocation');
      setCreateMessage(`Customer ${result.customer.name} created. Add a service location.`);
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  async function submitJobCustomer(confirmDuplicate = false) {
    setIsCreatingJobCustomer(true);
    setCreateMessage(null);

    try {
      const result = await onCreateJobCustomer({
        name: jobCustomerForm.name.trim(),
        accountType: jobCustomerForm.accountType,
        billingAddressLine1: jobCustomerForm.billingAddressLine1.trim(),
        billingCity: jobCustomerForm.billingCity.trim(),
        billingState: jobCustomerForm.billingState.trim(),
        billingPostalCode: jobCustomerForm.billingPostalCode.trim(),
        phone: optionalString(jobCustomerForm.phone),
        email: optionalString(jobCustomerForm.email),
        fax: optionalString(jobCustomerForm.fax),
        flags: splitCommaValues(jobCustomerForm.flags),
        confirmDuplicate
      });

      if (result.status === 'duplicate') {
        setJobCustomerDuplicateWarnings(result.duplicateWarnings);
        return;
      }

      setJobCustomerForm(createEmptyCustomerForm());
      setJobCustomerDuplicateWarnings([]);
      setJobCustomerMode('closed');
      setCreateMessage(`Customer ${result.customer.name} selected for this job.`);
    } finally {
      setIsCreatingJobCustomer(false);
    }
  }

  async function submitLocation(
    options: {
      confirmDuplicate?: boolean;
      confirmMissingContactInfo?: boolean;
    } = {}
  ) {
    if (!selectedCustomer) {
      return;
    }

    setIsCreatingLocation(true);
    setCreateMessage(null);

    try {
      const result = await onCreateLocation({
        customerId: selectedCustomer.id,
        name: locationForm.name.trim(),
        addressLine1: locationForm.addressLine1.trim(),
        city: locationForm.city.trim(),
        state: locationForm.state.trim(),
        postalCode: locationForm.postalCode.trim(),
        phone: optionalString(locationForm.phone),
        email: optionalString(locationForm.email),
        fax: optionalString(locationForm.fax),
        confirmDuplicate: options.confirmDuplicate,
        confirmMissingContactInfo: options.confirmMissingContactInfo
      });

      if (result.status === 'missingContact') {
        setLocationMissingContactConfirmation(true);
        return;
      }

      if (result.status === 'duplicate') {
        setLocationDuplicateWarnings(result.duplicateWarnings);
        return;
      }

      setLocationForm(createEmptyLocationForm(result.location.customerId));
      setLocationDuplicateWarnings([]);
      setLocationMissingContactConfirmation(false);
      setIntakeMode('search');
    } finally {
      setIsCreatingLocation(false);
    }
  }

  return (
    <section aria-label="New job" style={styles.workspacePanel}>
      <div style={styles.row}>
        <div>
          <h1 style={styles.compactTitle}>New job</h1>
          <p style={styles.tinyMuted}>
            Start the call, then search or create the customer and site.
          </p>
        </div>
        <button type="button" style={styles.button} onClick={onClose}>
          Close
        </button>
      </div>

      {selectedLocation ? (
        <>
          <SelectedLocationCard
            jobCustomerOverride={jobCustomerOverride}
            selectedLocation={selectedLocation}
            onClearJobCustomerOverride={onClearJobCustomerOverride}
            onClearSelectedLocation={onClearSelectedLocation}
            onOpenJobCustomerOverride={() => {
              setJobCustomerMode('search');
              setJobCustomerDuplicateWarnings([]);
              setJobCustomerForm(createEmptyCustomerForm());
            }}
          />
          {jobCustomerMode !== 'closed' ? (
            <JobCustomerOverridePanel
              duplicateWarnings={jobCustomerDuplicateWarnings}
              isCreatingCustomer={isCreatingJobCustomer}
              isSearching={isJobCustomerSearchLoading}
              mode={jobCustomerMode}
              searchQuery={jobCustomerSearchQuery}
              searchResults={jobCustomerSearchResults.filter(
                (result) => result.kind === 'customer'
              )}
              customerForm={jobCustomerForm}
              onCancel={() => {
                setJobCustomerMode('closed');
                setJobCustomerDuplicateWarnings([]);
                setJobCustomerForm(createEmptyCustomerForm());
              }}
              onChangeCustomerForm={setJobCustomerForm}
              onNewCustomer={() => {
                setJobCustomerMode('newCustomer');
                setJobCustomerDuplicateWarnings([]);
                setJobCustomerForm(createEmptyCustomerForm());
              }}
              onSearchQueryChange={onJobCustomerSearchQueryChange}
              onSelectCustomer={onSelectJobCustomerSearchResult}
              onSubmitCustomer={() => void submitJobCustomer()}
              onSubmitCustomerAnyway={() => void submitJobCustomer(true)}
            />
          ) : null}
        </>
      ) : (
        <ServiceLocationStep
          createMessage={createMessage}
          customerDuplicateWarnings={customerDuplicateWarnings}
          customerForm={customerForm}
          customerLocationMessage={customerLocationMessage}
          customerLocationOptions={customerLocationOptions}
          intakeMode={intakeMode}
          isCreatingCustomer={isCreatingCustomer}
          isCreatingLocation={isCreatingLocation}
          isLocationSearchLoading={isLocationSearchLoading}
          locationDuplicateWarnings={locationDuplicateWarnings}
          locationForm={locationForm}
          locationMissingContactConfirmation={locationMissingContactConfirmation}
          locationSearchQuery={locationSearchQuery}
          locationSearchResults={visibleLocationSearchResults}
          selectedCustomer={selectedCustomer}
          onAddLocation={() => {
            if (!selectedCustomer) {
              return;
            }

            setLocationForm(createEmptyLocationForm(selectedCustomer.id));
            setLocationDuplicateWarnings([]);
            setLocationMissingContactConfirmation(false);
            setCreateMessage(null);
            setIntakeMode('newLocation');
          }}
          onCancelQuickCreate={() => {
            setIntakeMode('search');
            setCustomerDuplicateWarnings([]);
            setLocationDuplicateWarnings([]);
            setLocationMissingContactConfirmation(false);
            setCreateMessage(null);
          }}
          onCustomerFormChange={setCustomerForm}
          onLocationFormChange={setLocationForm}
          onLocationSearchQueryChange={onLocationSearchQueryChange}
          onNewCustomer={() => {
            setCustomerForm(createEmptyCustomerForm());
            setCustomerDuplicateWarnings([]);
            setCreateMessage(null);
            setIntakeMode('newCustomer');
          }}
          onSelectCustomerLocation={onSelectCustomerLocation}
          onSelectLocationSearchResult={onSelectLocationSearchResult}
          onSubmitCustomer={() => void submitCustomer()}
          onSubmitCustomerAnyway={() => void submitCustomer(true)}
          onSubmitLocation={() => void submitLocation()}
          onSubmitLocationAnyway={() =>
            void submitLocation({
              confirmDuplicate: true,
              confirmMissingContactInfo: locationMissingContactConfirmation
            })
          }
          onSubmitLocationWithoutContact={() =>
            void submitLocation({
              confirmMissingContactInfo: true
            })
          }
        />
      )}

      <JobDetailsStep
        intakeContext={intakeContext}
        jobCategory={jobCategory}
        jobDate={jobDate}
        jobEndTime={jobEndTime}
        jobOrigin={jobOrigin}
        jobStartTime={jobStartTime}
        jobSummary={jobSummary}
        jobTechnicianId={jobTechnicianId}
        jobType={jobType}
        jobWindow={jobWindow}
        onJobCategoryChange={onJobCategoryChange}
        onJobDateChange={onJobDateChange}
        onJobEndTimeChange={onJobEndTimeChange}
        onJobOriginChange={onJobOriginChange}
        onJobStartTimeChange={onJobStartTimeChange}
        onJobSummaryChange={onJobSummaryChange}
        onJobTechnicianChange={onJobTechnicianChange}
        onJobTypeChange={onJobTypeChange}
        onJobWindowChange={onJobWindowChange}
      />
      {!selectedLocation ? (
        <p style={styles.tinyMuted}>Select or create a service location before creating the job.</p>
      ) : null}
      <button
        type="button"
        style={createJobButtonStyle}
        disabled={!selectedLocation}
        onClick={() => void onCreateJob()}
      >
        Create job
      </button>
    </section>
  );
}

function JobCustomerOverridePanel({
  customerForm,
  duplicateWarnings,
  isCreatingCustomer,
  isSearching,
  mode,
  searchQuery,
  searchResults,
  onCancel,
  onChangeCustomerForm,
  onNewCustomer,
  onSearchQueryChange,
  onSelectCustomer,
  onSubmitCustomer,
  onSubmitCustomerAnyway
}: {
  customerForm: CustomerFormState;
  duplicateWarnings: DuplicateCandidate[];
  isCreatingCustomer: boolean;
  isSearching: boolean;
  mode: 'search' | 'newCustomer';
  searchQuery: string;
  searchResults: CrmSearchResult[];
  onCancel: () => void;
  onChangeCustomerForm: (updater: (current: CustomerFormState) => CustomerFormState) => void;
  onNewCustomer: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectCustomer: (result: CrmSearchResult) => void;
  onSubmitCustomer: () => void;
  onSubmitCustomerAnyway: () => void;
}) {
  return (
    <div aria-label="Change customer for this job" role="group" style={styles.subpanel}>
      <div style={styles.row}>
        <div>
          <h2 style={styles.sectionHeading}>Change customer for this job</h2>
          <p style={styles.tinyMuted}>
            This affects this job only. It does not reassign the location.
          </p>
        </div>
        <button type="button" style={styles.button} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {mode === 'search' ? (
        <>
          <div style={styles.inlineActionBar}>
            <label style={{ ...styles.fieldLabel, flex: '1 1 16rem' }}>
              <span>Customer search</span>
              <input
                aria-label="Job customer search"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search by customer, phone, or email"
                style={styles.input}
              />
            </label>
            <button type="button" style={styles.button} onClick={onNewCustomer}>
              New customer
            </button>
          </div>
          {isSearching ? <p style={styles.tinyMuted}>Searching...</p> : null}
          {searchResults.length > 0 ? (
            <div aria-label="Job customer search results" role="group" style={styles.listCompact}>
              {searchResults.map((result) => (
                <button
                  key={`job-customer:${result.id}`}
                  type="button"
                  style={styles.cardButton}
                  onClick={() => onSelectCustomer(result)}
                >
                  <span style={styles.fieldText}>Customer</span>
                  <strong>{result.title}</strong>
                  <span style={styles.tinyMuted}>{result.subtitle}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <CustomerQuickCreateForm
          duplicateWarnings={duplicateWarnings}
          form={customerForm}
          isSubmitting={isCreatingCustomer}
          onCancel={onCancel}
          onChange={onChangeCustomerForm}
          onSubmit={onSubmitCustomer}
          onSubmitAnyway={onSubmitCustomerAnyway}
        />
      )}
    </div>
  );
}
