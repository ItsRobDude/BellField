'use client';

import type {
  CreateCustomerRequest,
  CreateLocationRequest,
  CrmSearchResult,
  JobIntakeContextResponse
} from '@/lib/operations-api';
import {
  JobIntakePanel,
  type JobIntakeCreateCustomerResult,
  type JobIntakeCreateLocationResult,
  type JobIntakeCustomerLocationOption,
  type JobIntakeSelectedCustomer,
  type JobIntakeSelectedLocation
} from './job-intake-panel';

export type OfficeJobIntakeSurfaceProps = {
  isOpen: boolean;
  context: JobIntakeContextResponse | null;
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
  onCreateCustomer: JobIntakePanelCreateCustomerHandler;
  onCreateJobCustomer: JobIntakePanelCreateCustomerHandler;
  onCreateLocation: JobIntakePanelCreateLocationHandler;
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

export function OfficeJobIntakeSurface({
  isOpen,
  context,
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
}: OfficeJobIntakeSurfaceProps) {
  if (!isOpen || !context) {
    return null;
  }

  return (
    <JobIntakePanel
      intakeContext={context}
      locationSearchQuery={locationSearchQuery}
      locationSearchResults={locationSearchResults}
      isLocationSearchLoading={isLocationSearchLoading}
      selectedLocation={selectedLocation}
      selectedCustomer={selectedCustomer}
      customerLocationOptions={customerLocationOptions}
      customerLocationMessage={customerLocationMessage}
      jobCustomerOverride={jobCustomerOverride}
      jobCustomerSearchQuery={jobCustomerSearchQuery}
      jobCustomerSearchResults={jobCustomerSearchResults}
      isJobCustomerSearchLoading={isJobCustomerSearchLoading}
      jobType={jobType}
      jobCategory={jobCategory}
      jobOrigin={jobOrigin}
      jobSummary={jobSummary}
      jobTechnicianId={jobTechnicianId}
      jobDate={jobDate}
      jobStartTime={jobStartTime}
      jobEndTime={jobEndTime}
      jobWindow={jobWindow}
      onLocationSearchQueryChange={onLocationSearchQueryChange}
      onSelectLocationSearchResult={onSelectLocationSearchResult}
      onSelectCustomerLocation={onSelectCustomerLocation}
      onCreateCustomer={onCreateCustomer}
      onCreateJobCustomer={onCreateJobCustomer}
      onCreateLocation={onCreateLocation}
      onClearSelectedLocation={onClearSelectedLocation}
      onClearJobCustomerOverride={onClearJobCustomerOverride}
      onJobCustomerSearchQueryChange={onJobCustomerSearchQueryChange}
      onSelectJobCustomerSearchResult={onSelectJobCustomerSearchResult}
      onJobTypeChange={onJobTypeChange}
      onJobCategoryChange={onJobCategoryChange}
      onJobOriginChange={onJobOriginChange}
      onJobSummaryChange={onJobSummaryChange}
      onJobTechnicianChange={onJobTechnicianChange}
      onJobDateChange={onJobDateChange}
      onJobStartTimeChange={onJobStartTimeChange}
      onJobEndTimeChange={onJobEndTimeChange}
      onJobWindowChange={onJobWindowChange}
      onCreateJob={onCreateJob}
      onClose={onClose}
    />
  );
}

type JobIntakePanelCreateCustomerHandler = (
  input: CreateCustomerRequest
) => Promise<JobIntakeCreateCustomerResult>;

type JobIntakePanelCreateLocationHandler = (
  input: CreateLocationRequest
) => Promise<JobIntakeCreateLocationResult>;
