'use client';

import type { JobIntakeContextResponse } from '@/lib/operations-api';
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

type JobIntakePanelProps = {
  intakeContext: JobIntakeContextResponse;
  jobLocationId: string;
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
  onJobLocationChange: (locationId: string) => void;
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
  jobLocationId,
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
  onJobLocationChange,
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
  const selectedLocation =
    intakeContext.locations.find((location) => location.id === jobLocationId) ?? null;
  const billToCustomerIds = selectedLocation
    ? [selectedLocation.customerId, ...selectedLocation.alternateBillToCustomerIds]
    : [];

  return (
    <section aria-label="New job" style={styles.workspacePanel}>
      <div style={styles.row}>
        <h1 style={styles.compactTitle}>New job</h1>
        <button type="button" style={styles.button} onClick={onClose}>
          Close
        </button>
      </div>
      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          <span>Location</span>
          <select
            value={jobLocationId}
            onChange={(event) => onJobLocationChange(event.target.value)}
            style={styles.input}
          >
            {intakeContext.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.fieldLabel}>
          <span>Bill to</span>
          <select
            value={jobBillToCustomerId}
            onChange={(event) => onJobBillToCustomerChange(event.target.value)}
            style={styles.input}
          >
            {billToCustomerIds.map((customerId) => {
              const customer = intakeContext.customers.find(
                (candidate) => candidate.id === customerId
              );
              return customer ? (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ) : null;
            })}
          </select>
        </label>
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
      <button type="button" style={styles.primaryButton} onClick={() => void onCreateJob()}>
        Create job
      </button>
    </section>
  );
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
