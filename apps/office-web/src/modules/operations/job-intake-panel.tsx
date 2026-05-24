'use client';

import type { CrmSearchResult, JobIntakeContextResponse } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

const jobTypeOptions = ['Service', 'Maintenance', 'Install', 'Estimate', 'Callback'];
const jobCategoryOptions = [
  'General',
  'Residential',
  'Commercial',
  'Warranty',
  'Maintenance Agreement'
];
const jobOriginOptions = [
  'Inbound phone call',
  'Outbound phone call',
  'Email',
  'Web request',
  'Walk-in',
  'PM contract reminder'
];
const arrivalWindowOptions = [
  '',
  '8:00 AM - 10:00 AM',
  '10:00 AM - 12:00 PM',
  '12:00 PM - 2:00 PM',
  '1:00 PM - 3:00 PM',
  '2:00 PM - 4:00 PM',
  '3:00 PM - 5:00 PM'
];

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

export type JobIntakeBillToOption = {
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

type JobIntakePanelProps = {
  intakeContext: JobIntakeContextResponse;
  locationSearchQuery: string;
  locationSearchResults: CrmSearchResult[];
  isLocationSearchLoading: boolean;
  selectedLocation: JobIntakeSelectedLocation | null;
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

export function JobIntakePanel({
  intakeContext,
  locationSearchQuery,
  locationSearchResults,
  isLocationSearchLoading,
  selectedLocation,
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
}: JobIntakePanelProps) {
  const visibleLocationSearchResults = locationSearchResults.filter(
    (result) => result.kind === 'location' || result.kind === 'customer'
  );
  const createJobButtonStyle = selectedLocation
    ? styles.primaryButton
    : { ...styles.primaryButton, cursor: 'not-allowed', opacity: 0.55 };

  return (
    <section aria-label="New job" style={styles.workspacePanel}>
      <div style={styles.row}>
        <h1 style={styles.compactTitle}>New job</h1>
        <button type="button" style={styles.button} onClick={onClose}>
          Close
        </button>
      </div>
      <div style={styles.formGridCompact}>
        <div style={{ ...styles.formGridFullWidth, display: 'grid', gap: '0.65rem' }}>
          {selectedLocation ? (
            <div aria-label="Selected job location" role="group" style={styles.subpanel}>
              <div style={styles.row}>
                <div>
                  <strong>{selectedLocation.name}</strong>
                  <p style={styles.tinyMuted}>
                    {selectedLocation.customerName} - {formatAddress(selectedLocation)}
                  </p>
                </div>
                <button type="button" style={styles.button} onClick={onClearSelectedLocation}>
                  Change
                </button>
              </div>
            </div>
          ) : (
            <>
              <label style={styles.fieldLabel}>
                <span>Location</span>
                <input
                  aria-label="Job location search"
                  value={locationSearchQuery}
                  onChange={(event) => onLocationSearchQueryChange(event.target.value)}
                  placeholder="Search location or customer"
                  style={styles.input}
                />
              </label>
              {isLocationSearchLoading ? <p style={styles.tinyMuted}>Searching...</p> : null}
              {visibleLocationSearchResults.length > 0 ? (
                <div
                  aria-label="Job location search results"
                  role="group"
                  style={styles.listCompact}
                >
                  {visibleLocationSearchResults.map((result) => (
                    <button
                      key={`${result.kind}:${result.id}`}
                      type="button"
                      style={styles.cardButton}
                      onClick={() => onSelectLocationSearchResult(result)}
                    >
                      <span style={styles.fieldText}>
                        {result.kind === 'location' ? 'Location' : 'Customer'}
                      </span>
                      <strong>{result.title}</strong>
                      <span style={styles.tinyMuted}>{result.subtitle}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {customerLocationOptions.length > 0 ? (
                <div aria-label="Customer locations" role="group" style={styles.subpanel}>
                  <p style={styles.sectionHeading}>Select a location for this customer</p>
                  <div style={styles.listCompact}>
                    {customerLocationOptions.map((location) => (
                      <button
                        key={location.id}
                        type="button"
                        style={styles.cardButton}
                        onClick={() => onSelectCustomerLocation(location.id)}
                      >
                        <strong>{location.name}</strong>
                        <span style={styles.tinyMuted}>{formatAddress(location)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {customerLocationMessage ? (
                <p style={styles.tinyMuted}>{customerLocationMessage}</p>
              ) : null}
            </>
          )}
        </div>
        {selectedLocation ? (
          <label style={styles.fieldLabel}>
            <span>Bill to</span>
            <select
              value={jobBillToCustomerId}
              onChange={(event) => onJobBillToCustomerChange(event.target.value)}
              style={styles.input}
            >
              {billToOptions.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            {billToWarning ? <span style={styles.tinyMuted}>{billToWarning}</span> : null}
          </label>
        ) : null}
        <SelectField
          label="Type"
          value={jobType}
          options={jobTypeOptions}
          onChange={onJobTypeChange}
        />
        <SelectField
          label="Category"
          value={jobCategory}
          options={jobCategoryOptions}
          onChange={onJobCategoryChange}
        />
        <SelectField
          label="Origin"
          value={jobOrigin}
          options={jobOriginOptions}
          onChange={onJobOriginChange}
        />
        <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
          <span>Problem summary</span>
          <textarea
            aria-label="Job problem summary"
            value={jobSummary}
            onChange={(event) => onJobSummaryChange(event.target.value)}
            style={styles.textarea}
          />
        </label>
      </div>

      <div style={styles.formSection}>
        <h2 style={styles.sectionHeading}>Appointment scheduling</h2>
        <div style={styles.formGridCompact}>
          <TextField label="Dispatch date" type="date" value={jobDate} onChange={onJobDateChange} />
          <SelectField
            label="Customer arrival window"
            value={jobWindow}
            options={arrivalWindowOptions}
            optionLabels={{ '': 'No arrival window' }}
            onChange={onJobWindowChange}
          />
          <TextField
            label="Scheduled start"
            type="time"
            value={jobStartTime}
            disabled={!jobDate}
            onChange={onJobStartTimeChange}
          />
          <TextField
            label="Scheduled end"
            type="time"
            value={jobEndTime}
            disabled={!jobDate}
            onChange={onJobEndTimeChange}
          />
          <label style={styles.fieldLabel}>
            <span>Technician</span>
            <select
              value={jobTechnicianId}
              onChange={(event) => onJobTechnicianChange(event.target.value)}
              style={styles.input}
            >
              <option value="">Unassigned</option>
              {intakeContext.technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
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

function formatAddress(location: {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}): string {
  return [location.addressLine1, location.city, location.state, location.postalCode]
    .filter(Boolean)
    .join(', ');
}

function SelectField({
  label,
  value,
  options,
  optionLabels = {},
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      <span>{label}</span>
      <select
        aria-label={`Job ${label.toLowerCase()}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={styles.input}
      >
        {options.map((option) => (
          <option key={option || 'blank'} value={option}>
            {optionLabels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  type = 'text',
  disabled = false,
  onChange
}: {
  label: string;
  value: string;
  type?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      <span>{label}</span>
      <input
        aria-label={`Job ${label.toLowerCase()}`}
        value={value}
        type={type}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={styles.input}
      />
    </label>
  );
}
