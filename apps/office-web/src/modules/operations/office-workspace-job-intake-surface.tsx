'use client';

import type {
  CreateCustomerRequest,
  CreateLocationRequest,
  CrmSearchResult,
  JobIntakeContextResponse
} from '@/lib/operations-api';
import {
  JobIntakePanel,
  type JobIntakeBillToOption,
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
  billToOptions: JobIntakeBillToOption[];
  billToWarning: string | null;
  jobBillToCustomerId: string;
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
  onCreateLocation: JobIntakePanelCreateLocationHandler;
  onClearSelectedLocation: () => void;
  onJobBillToCustomerChange: (customerId: string) => void;
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
  billToOptions,
  billToWarning,
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
  onLocationSearchQueryChange,
  onSelectLocationSearchResult,
  onSelectCustomerLocation,
  onCreateCustomer,
  onCreateLocation,
  onClearSelectedLocation,
  onJobBillToCustomerChange,
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
      billToOptions={billToOptions}
      billToWarning={billToWarning}
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
      onLocationSearchQueryChange={onLocationSearchQueryChange}
      onSelectLocationSearchResult={onSelectLocationSearchResult}
      onSelectCustomerLocation={onSelectCustomerLocation}
      onCreateCustomer={onCreateCustomer}
      onCreateLocation={onCreateLocation}
      onClearSelectedLocation={onClearSelectedLocation}
      onJobBillToCustomerChange={onJobBillToCustomerChange}
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
