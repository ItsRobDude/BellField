'use client';

import type { JobIntakeContextResponse } from '@/lib/operations-api';
import type { JobIntakeSelectedCustomer, JobIntakeSelectedLocation } from './job-intake-panel';
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

export function SelectedLocationCard({
  jobCustomerOverride,
  selectedLocation,
  onClearSelectedLocation,
  onClearJobCustomerOverride,
  onOpenJobCustomerOverride
}: {
  jobCustomerOverride: JobIntakeSelectedCustomer | null;
  selectedLocation: JobIntakeSelectedLocation;
  onClearSelectedLocation: () => void;
  onClearJobCustomerOverride: () => void;
  onOpenJobCustomerOverride: () => void;
}) {
  return (
    <div aria-label="Selected job location" role="group" style={styles.subpanel}>
      <div style={styles.row}>
        <div>
          <strong>{selectedLocation.name}</strong>
          <p style={styles.tinyMuted}>{formatAddress(selectedLocation)}</p>
          <p style={styles.tinyMuted}>Location owner: {selectedLocation.customerName}</p>
        </div>
        <button type="button" style={styles.button} onClick={onClearSelectedLocation}>
          Change location
        </button>
      </div>
      <div style={styles.inlineActionBar}>
        <div>
          <span style={styles.fieldText}>Customer for this job</span>
          <p style={styles.tinyMuted}>
            {jobCustomerOverride
              ? jobCustomerOverride.name
              : `${selectedLocation.customerName} (location owner)`}
          </p>
        </div>
        <button type="button" style={styles.button} onClick={onOpenJobCustomerOverride}>
          Change customer for this job
        </button>
        {jobCustomerOverride ? (
          <button type="button" style={styles.button} onClick={onClearJobCustomerOverride}>
            Use location owner
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function JobDetailsStep({
  intakeContext,
  jobCategory,
  jobDate,
  jobEndTime,
  jobOrigin,
  jobStartTime,
  jobSummary,
  jobTechnicianId,
  jobType,
  jobWindow,
  onJobCategoryChange,
  onJobDateChange,
  onJobEndTimeChange,
  onJobOriginChange,
  onJobStartTimeChange,
  onJobSummaryChange,
  onJobTechnicianChange,
  onJobTypeChange,
  onJobWindowChange
}: {
  intakeContext: JobIntakeContextResponse;
  jobCategory: string;
  jobDate: string;
  jobEndTime: string;
  jobOrigin: string;
  jobStartTime: string;
  jobSummary: string;
  jobTechnicianId: string;
  jobType: string;
  jobWindow: string;
  onJobCategoryChange: (value: string) => void;
  onJobDateChange: (value: string) => void;
  onJobEndTimeChange: (value: string) => void;
  onJobOriginChange: (value: string) => void;
  onJobStartTimeChange: (value: string) => void;
  onJobSummaryChange: (value: string) => void;
  onJobTechnicianChange: (value: string) => void;
  onJobTypeChange: (value: string) => void;
  onJobWindowChange: (value: string) => void;
}) {
  return (
    <>
      <div style={styles.formSection}>
        <h2 style={styles.sectionHeading}>Call and work details</h2>
        <div style={styles.formGridCompact}>
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
    </>
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
